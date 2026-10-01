"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatHistory, ChatTurn } from '@/types/chat';
import { messageForSend, parsePendingMessage, type PendingMessage } from '@/lib/chat-settings';
import { defaultChatSettings, parseChatSettings, type ChatSettings } from '../../../shared/chat-settings.mjs';

const pendingKey = 'eidos-chat-pending';
const settingsKey = 'eidos-chat-settings-v1';

async function chatRequest<T>(path = '', body?: unknown): Promise<T> {
  const response = await fetch(`/api/chat${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store', signal: AbortSignal.timeout(20000),
  });
  if (response.redirected || response.status === 401) throw new Error('Your session expired. Please sign in again.');
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(data?.error || 'Could not reach Eidos. Please try again.');
  return data as T;
}

function savePending(value: PendingMessage | null) {
  try {
    if (value) sessionStorage.setItem(pendingKey, JSON.stringify(value));
    else sessionStorage.removeItem(pendingKey);
  } catch { /* A blocked browser store must not prevent sending. */ }
}

export function useChatConversation() {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const turnsRef = useRef<ChatTurn[]>([]);
  const loadedRef = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [online, setOnline] = useState(false);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [pending, setPending] = useState<PendingMessage | null>(null);
  const pendingRef = useRef<PendingMessage | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [settings, setSettings] = useState<ChatSettings>(defaultChatSettings);

  function changeSettings(next: ChatSettings) {
    const value = parseChatSettings(next);
    setSettings(value);
    try { localStorage.setItem(settingsKey, JSON.stringify(value)); }
    catch { /* Browser preferences must not prevent sending. */ }
  }

  const merge = useCallback((incoming: ChatTurn[]) => {
    const combined = new Map(turnsRef.current.map((turn) => [turn.id, turn]));
    for (const turn of incoming) {
      const existing = combined.get(turn.id);
      if (!existing || turn.revision >= existing.revision) combined.set(turn.id, turn);
    }
    const next = [...combined.values()].sort((a, b) => a.seq - b.seq);
    turnsRef.current = next;
    setTurns(next);
    if (pendingRef.current && combined.has(pendingRef.current.id)) {
      pendingRef.current = null;
      setPending(null);
      savePending(null);
    }
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(settingsKey);
      if (saved) setSettings(parseChatSettings(JSON.parse(saved)));
    } catch { /* An obsolete preference uses the current default. */ }
    try {
      const saved = parsePendingMessage(JSON.parse(sessionStorage.getItem(pendingKey) || 'null'));
      if (saved) {
        pendingRef.current = saved;
        setPending(saved);
      }
    } catch { /* Ignore invalid local recovery state. */ }
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let fetching = false;
    let catchUp = false;
    async function refresh() {
      if (disposed || fetching) return;
      clearTimeout(timer);
      if (document.hidden) { timer = setTimeout(refresh, 15000); return; }
      fetching = true;
      try {
        const current = turnsRef.current;
        const active = current.find((turn) => turn.status === 'queued' || turn.status === 'running');
        // Re-read the latest turn so a retry from another device is visible too.
        const cursor = active ? active.seq - 1 : Math.max(0, (current.at(-1)?.seq || 0) - 1);
        const initial = !loadedRef.current;
        const result = await chatRequest<ChatHistory>(initial ? '' : `?after=${cursor}`);
        if (disposed) return;
        merge(result.turns);
        if (initial) setHasOlder(result.has_more);
        catchUp = !initial && result.has_more;
        setOnline(result.agent_online);
        loadedRef.current = true;
        setLoaded(true);
        setError('');
      } catch (cause) {
        if (!disposed) setError(cause instanceof Error ? cause.message : 'Could not load the conversation.');
      } finally {
        fetching = false;
        if (!disposed) {
          const active = turnsRef.current.some((turn) => turn.status === 'queued' || turn.status === 'running');
          timer = setTimeout(refresh, catchUp ? 100 : active ? 2000 : 15000);
        }
      }
    }
    const onFocus = () => { void refresh(); };
    void refresh();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('eidos-chat-refresh', onFocus);
    return () => {
      disposed = true;
      clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('eidos-chat-refresh', onFocus);
    };
  }, [merge]);

  async function send(prompt: string, retryTurn?: ChatTurn) {
    if (sendingRef.current) return false;
    const message = messageForSend(prompt, settings, pendingRef.current, retryTurn);
    sendingRef.current = true;
    setSending(true);
    setError('');
    if (!retryTurn) {
      pendingRef.current = message;
      setPending(message);
      savePending(message);
    }
    try {
      const result = await chatRequest<{ turn: ChatTurn }>('', { ...message, retry: Boolean(retryTurn) });
      merge([result.turn]);
      window.dispatchEvent(new Event('eidos-chat-refresh'));
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send your message.');
      return false;
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  async function loadOlder() {
    if (loadingOlder || !turnsRef.current.length) return;
    setLoadingOlder(true);
    try {
      const result = await chatRequest<ChatHistory>(`?before=${turnsRef.current[0].seq}`);
      merge(result.turns);
      setHasOlder(result.has_more);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load earlier messages.'); }
    finally { setLoadingOlder(false); }
  }

  return { turns, loaded, error, online, sending, pending, hasOlder, loadingOlder, settings, changeSettings, send, loadOlder };
}
