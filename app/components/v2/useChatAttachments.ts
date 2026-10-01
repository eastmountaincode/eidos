"use client";

import { useEffect, useRef, useState } from 'react';
import { attachmentMetadata, MAX_ATTACHMENTS, MAX_MESSAGE_BYTES, parseAttachments, type ChatAttachment } from '../../../shared/chat-attachments.mjs';

export type Upload = { key: string; name: string; size: number; file?: File; attachment?: ChatAttachment; progress: number; error?: string };
const storageKey = 'eidos-chat-attachments-v1';

export function useChatAttachments() {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const current = useRef<Upload[]>([]);
  const [error, setError] = useState('');
  const controllers = useRef(new Map<string, AbortController>());
  const mounted = useRef(false);

  function update(next: Upload[]) {
    current.current = next;
    setUploads(next);
    try { sessionStorage.setItem(storageKey, JSON.stringify(next.flatMap((item) => item.attachment ? [item.attachment] : []))); }
    catch { /* Uploading still works without browser storage. */ }
  }
  function patch(key: string, changes: Partial<Upload>) {
    if (mounted.current) update(current.current.map((item) => item.key === key ? { ...item, ...changes } : item));
  }
  useEffect(() => {
    mounted.current = true;
    try {
      const saved = parseAttachments(JSON.parse(sessionStorage.getItem(storageKey) || '[]'));
      current.current = saved.map((attachment) => ({ key: attachment.id, name: attachment.name, size: attachment.size, attachment, progress: 100 }));
      setUploads(current.current);
    } catch { /* Ignore invalid drafts. */ }
    const active = controllers.current;
    return () => { mounted.current = false; for (const controller of active.values()) controller.abort(); };
  }, []);

  async function upload(item: Upload) {
    if (!item.file) return;
    const controller = new AbortController();
    controllers.current.set(item.key, controller);
    patch(item.key, { error: undefined, progress: 0 });
    try {
      const hash = await crypto.subtle.digest('SHA-256', await item.file.arrayBuffer());
      const sha256 = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
      const response = await fetch('/api/chat/files', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...attachmentMetadata(item.file), sha256 }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) throw new Error(data?.error || 'Could not start upload. Please sign in again or retry.');
      const attachment = await new Promise<ChatAttachment>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const abort = () => { xhr.abort(); reject(new Error('Upload cancelled.')); };
        if (controller.signal.aborted) return abort();
        controller.signal.addEventListener('abort', abort, { once: true });
        xhr.open('PUT', data.upload_url);
        xhr.setRequestHeader('Content-Type', 'application/octet-stream');
        xhr.timeout = 180000;
        xhr.upload.onprogress = (event) => { if (event.lengthComputable) patch(item.key, { progress: Math.min(99, Math.round(event.loaded / event.total * 100)) }); };
        xhr.onloadend = () => controller.signal.removeEventListener('abort', abort);
        xhr.onerror = () => reject(new Error('Upload interrupted. Try again.'));
        xhr.ontimeout = () => reject(new Error('Upload timed out. Try again.'));
        xhr.onload = () => {
          try {
            const result = JSON.parse(xhr.responseText);
            if (xhr.status < 200 || xhr.status >= 300) throw new Error(result.error || 'Upload failed.');
            resolve(parseAttachments([result.attachment])[0]);
          } catch (cause) { reject(cause); }
        };
        xhr.send(item.file);
      });
      patch(item.key, { attachment, progress: 100, file: undefined });
    } catch (cause) {
      if (!controller.signal.aborted) patch(item.key, { error: cause instanceof Error ? cause.message : 'Upload failed.' });
    } finally { controllers.current.delete(item.key); }
  }

  function add(files: File[]) {
    setError('');
    const accepted: Upload[] = [];
    let total = current.current.reduce((sum, item) => sum + item.size, 0);
    for (const file of files) {
      try {
        const meta = attachmentMetadata(file);
        if (current.current.length + accepted.length >= MAX_ATTACHMENTS) throw new Error('Attach up to 5 files per message.');
        if (total + file.size > MAX_MESSAGE_BYTES) throw new Error('Keep the total attachments under 50 MB.');
        accepted.push({ key: crypto.randomUUID(), ...meta, file, progress: 0 });
        total += file.size;
      } catch (cause) { setError(`${file.name}: ${cause instanceof Error ? cause.message : 'Cannot attach file.'}`); }
    }
    update([...current.current, ...accepted]);
    // Serialize file hashing/uploads to bound browser and Worker memory use.
    void (async () => { for (const item of accepted) if (current.current.some((entry) => entry.key === item.key)) await upload(item); })();
  }
  function remove(key: string) {
    controllers.current.get(key)?.abort();
    update(current.current.filter((item) => item.key !== key));
  }
  function clear() { update([]); setError(''); }
  return { uploads, error, add, remove, clear, retry: upload,
    ready: uploads.flatMap((item) => item.attachment ? [item.attachment] : []),
    blocked: uploads.some((item) => !item.attachment) };
}
