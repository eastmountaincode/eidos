"use client";

import { ArrowUp, Plus } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

type Profile = "personal" | "creative" | "bioinformatics";
type Message = { id: string; text: string };

export function ChatInterface() {
  const [profile, setProfile] = useState<Profile>("personal");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  function send(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text) return;

    setMessages((current) => [...current, { id: crypto.randomUUID(), text }]);
    setDraft("");
    inputRef.current?.focus();
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  }

  function newChat() {
    setMessages([]);
    setDraft("");
    inputRef.current?.focus();
  }

  return (
    <section aria-label="Chat" className="flex h-full min-h-0 flex-col">
      <header className="flex h-[68px] shrink-0 items-center justify-between gap-3 border-b border-[#eceae3] bg-white/65 px-4 sm:px-7">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#5b6f60]">Chat</p>
          <h1 className="truncate text-[16px] font-semibold text-[#193129] sm:text-[17px]">
            {messages.length ? messages[0].text : "New conversation"}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <label className="sr-only" htmlFor="eidos-profile">Profile</label>
          <select
            className="h-9 max-w-[140px] rounded-xl border border-[#e6e8e1] bg-white px-3 text-[12px] font-medium text-[#364e40] outline-none focus-visible:ring-2 focus-visible:ring-[#93ac98] sm:text-[13px]"
            id="eidos-profile"
            onChange={(event) => setProfile(event.target.value as Profile)}
            value={profile}
          >
            <option value="personal">Personal</option>
            <option value="creative">Creative</option>
            <option value="bioinformatics">Bioinformatics</option>
          </select>
          <button
            aria-label="New conversation"
            className="flex h-9 items-center gap-1.5 rounded-xl border border-[#e6e8e1] bg-white px-2.5 text-[12px] font-medium text-[#364e40] transition hover:border-[#c7d3c8] hover:bg-[#f7f9f6] sm:px-3 sm:text-[13px]"
            onClick={newChat}
            type="button"
          >
            <Plus aria-hidden="true" className="size-4" strokeWidth={1.8} />
            <span className="hidden sm:inline">New chat</span>
          </button>
        </div>
      </header>

      <div className="eidos-v2-scroll min-h-0 flex-1 overflow-y-auto px-4 sm:px-8" role="log" aria-label="Conversation" aria-live="polite">
        {messages.length ? (
          <div className="mx-auto w-full max-w-[800px] py-8 sm:py-10">
            <ol className="flex flex-col gap-5">
              {messages.map((message) => (
                <li className="flex justify-end" key={message.id}>
                  <div className="max-w-[min(85%,620px)] whitespace-pre-wrap break-words rounded-[22px] rounded-br-[7px] bg-[#214335] px-4 py-3 text-[14px] leading-[1.6] text-white shadow-[0_2px_10px_rgba(23,53,39,0.08)] sm:px-5 sm:text-[15px]">
                    {message.text}
                  </div>
                </li>
              ))}
            </ol>
            <div ref={bottomRef} />
          </div>
        ) : (
          <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-5 pb-10">
            <div aria-hidden="true" className="eidos-v2-wordmark grid size-[72px] place-items-center rounded-[24px] border border-[#dbe5d9] bg-[#edf2e9] text-[52px] leading-none text-[#255341] shadow-[0_8px_28px_rgba(30,66,47,0.06)]">
              e
            </div>
            <h2 className="eidos-v2-wordmark text-[38px] leading-none tracking-[-0.035em] text-[#254235] sm:text-[42px]">Eidos</h2>
          </div>
        )}
      </div>

      <div className="eidos-v2-composer shrink-0 bg-[#faf9f6] px-3 pt-2 sm:px-7">
        <form className="mx-auto w-full max-w-[800px]" onSubmit={send}>
          <div className="rounded-[22px] border border-[#dadfd6] bg-white p-2 shadow-[0_8px_32px_rgba(36,58,41,0.075)] focus-within:border-[#a8bbab] focus-within:shadow-[0_8px_32px_rgba(36,58,41,0.09)] sm:p-3">
            <label className="sr-only" htmlFor="eidos-message">Message Eidos</label>
            <textarea
              className="eidos-v2-textarea block max-h-40 min-h-[48px] w-full resize-none bg-transparent px-2 pt-2 text-[15px] leading-relaxed text-[#1b3427] outline-none placeholder:text-[#98a29a] sm:px-3"
              id="eidos-message"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onComposerKeyDown}
              placeholder="Message Eidos"
              ref={inputRef}
              rows={2}
              value={draft}
            />
            <div className="flex items-center justify-end px-1 pb-1 sm:px-2">
              <button
                aria-label="Send message"
                className="grid size-9 place-items-center rounded-xl bg-[#214335] text-white transition hover:bg-[#315b46] disabled:bg-[#e8ece6] disabled:text-[#a2ada4]"
                disabled={!draft.trim()}
                type="submit"
              >
                <ArrowUp aria-hidden="true" className="size-[18px]" strokeWidth={2} />
              </button>
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}
