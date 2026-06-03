import type { MessagePreview } from "@/types/messages";
import { formatDate } from "./format";

export function RecentMessages({ messages }: { messages: MessagePreview[] }) {
  if (!messages.length) {
    return (
      <section className="grid gap-2 border-t border-border pt-3">
        <h4 className="text-xs font-bold">Recent messages</h4>
        <p className="text-xs text-muted">No recent message previews in D1 for this conversation.</p>
      </section>
    );
  }

  return (
    <section className="grid gap-2 border-t border-border pt-3">
      <h4 className="text-xs font-bold">Recent messages</h4>
      <div className="grid max-h-80 gap-2 overflow-auto">
        {messages.map((message, index) => (
          <article className="grid gap-1 rounded-md border border-border bg-[#fafcfc] p-2" key={`${message.timestamp}-${index}`}>
            <div className="flex justify-between gap-2 text-[11px] text-soft">
              <strong className="text-ink">{message.direction === "sent" ? "You" : "Them"}</strong>
              <span>{formatDate(message.timestamp)}</span>
            </div>
            <p className="text-xs text-ink">{message.body || ""}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
