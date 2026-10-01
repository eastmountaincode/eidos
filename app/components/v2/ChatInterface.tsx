"use client";

import { ArrowUp, LoaderCircle, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useChatConversation } from './useChatConversation';

export function ChatInterface() {
  const [draft, setDraft] = useState('');
  const chat = useChatConversation();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const active = chat.turns.find((turn) => turn.status === 'queued' || turn.status === 'running');
  const last = chat.turns.at(-1);
  const pending = chat.pending && !chat.turns.some((turn) => turn.id === chat.pending?.id) ? chat.pending : null;

  useEffect(() => {
    if (nearBottom.current) bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [last?.id, last?.response, last?.status, pending?.id, chat.loaded]);

  async function send(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || active || chat.sending || pending || !chat.loaded) return;
    nearBottom.current = true;
    setDraft('');
    await chat.send(text);
    inputRef.current?.focus();
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  }

  async function loadOlder() {
    const container = scrollRef.current;
    const height = container?.scrollHeight || 0;
    const top = container?.scrollTop || 0;
    nearBottom.current = false;
    await chat.loadOlder();
    requestAnimationFrame(() => {
      if (container) container.scrollTop = top + container.scrollHeight - height;
    });
  }

  return (
    <section aria-label="Chat" className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-4 sm:px-7">
        <h1 className="text-sm font-semibold text-foreground">Chat</h1>
        {chat.loaded && !chat.online ? <span className="text-[12px] text-muted-foreground">Agent offline</span> : null}
      </header>

      <div className="eidos-v2-scroll min-h-0 flex-1 overflow-y-auto px-4 sm:px-8" ref={scrollRef}
        onScroll={() => {
          const element = scrollRef.current;
          if (element) nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 100;
        }} role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions text">
        {chat.turns.length || pending ? (
          <div className="mx-auto w-full max-w-[800px] py-8 sm:py-10">
            {chat.hasOlder ? <button className="mx-auto mb-7 block text-[13px] text-muted-foreground hover:text-foreground disabled:opacity-50" disabled={chat.loadingOlder} onClick={() => void loadOlder()} type="button">
              {chat.loadingOlder ? 'Loading…' : 'Earlier messages'}
            </button> : null}
            <ol className="flex flex-col gap-7">
              {chat.turns.map((turn) => (
                <li className="space-y-5" id={`turn-${turn.id}`} key={turn.id}>
                  <div className="flex justify-end"><div className="max-w-[min(85%,620px)] whitespace-pre-wrap break-words rounded-md bg-secondary px-4 py-3 text-[14px] leading-[1.6] text-foreground sm:px-5 sm:text-[15px]">
                    <span className="sr-only">You: </span>{turn.prompt}
                  </div></div>
                  {turn.response ? <div className="max-w-[720px] whitespace-pre-wrap break-words px-1 text-[14px] leading-[1.75] text-foreground sm:text-[15px]">
                    <span className="sr-only">Eidos: </span>{turn.response}
                  </div> : null}
                  {turn.status === 'queued' || turn.status === 'running' ? <div className="flex items-center gap-2 px-1 text-[13px] text-muted-foreground" role="status">
                    <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" />
                    {turn.status === 'running' ? 'Thinking…' : chat.online ? 'Sending to Eidos…' : 'Waiting for Eidos to reconnect…'}
                  </div> : null}
                  {turn.status === 'failed' ? <div className="space-y-2 px-1 text-[13px] text-destructive">
                    <p>{turn.error || 'Eidos could not finish this reply.'}</p>
                    {turn.id === last?.id ? <button className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40" disabled={Boolean(active) || chat.sending || Boolean(pending)} onClick={() => void chat.send(turn.prompt, turn)} type="button">
                      <RotateCcw aria-hidden="true" className="size-3.5" />Try again
                    </button> : null}
                  </div> : null}
                </li>
              ))}
              {pending ? <li className="space-y-2">
                <div className="flex justify-end"><div className="max-w-[85%] whitespace-pre-wrap break-words rounded-md bg-secondary px-4 py-3 text-[15px] leading-relaxed text-foreground">{pending.prompt}</div></div>
                <div className="text-right text-[12px] text-muted-foreground">
                  {chat.sending ? 'Sending…' : <button type="button" onClick={() => void chat.send(pending.prompt)}>Confirm delivery</button>}
                </div>
              </li> : null}
            </ol>
            <div ref={bottomRef} />
          </div>
        ) : (
          <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-5 pb-10">
            {chat.loaded ? <>
              <h2 className="eidos-v2-wordmark text-[38px] leading-none tracking-[-0.035em] text-foreground sm:text-[42px]">Eidos</h2>
            </> : <LoaderCircle aria-label="Loading conversation" className="size-5 animate-spin text-muted-foreground motion-reduce:animate-none" />}
          </div>
        )}
      </div>

      <div className="eidos-v2-composer shrink-0 bg-background px-3 pt-2 sm:px-7">
        {chat.error ? <p className="mx-auto mb-3 max-w-[800px] px-2 text-[13px] text-destructive" role="alert">{chat.error}</p> : null}
        <form className="mx-auto w-full max-w-[800px]" onSubmit={(event) => void send(event)}>
          <div className="rounded-md border border-border bg-white p-2 shadow-none focus-within:border-ring sm:p-3">
            <label className="sr-only" htmlFor="eidos-message">Message Eidos</label>
            <textarea className="eidos-v2-textarea block max-h-40 min-h-[48px] w-full resize-none bg-transparent px-2 pt-2 text-[15px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground sm:px-3"
              id="eidos-message" maxLength={20000} onChange={(event) => setDraft(event.target.value)} onKeyDown={onComposerKeyDown}
              placeholder="Message Eidos" ref={inputRef} rows={2} value={draft} />
            <div className="flex items-center justify-end px-1 pb-1 sm:px-2">
              <button aria-label="Send message" className="grid size-9 place-items-center rounded-sm bg-primary text-white transition hover:bg-primary/85 disabled:bg-secondary disabled:text-muted-foreground"
                disabled={!draft.trim() || !chat.loaded || Boolean(active) || chat.sending || Boolean(pending)} type="submit">
                <ArrowUp aria-hidden="true" className="size-[18px]" strokeWidth={2} />
              </button>
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}
