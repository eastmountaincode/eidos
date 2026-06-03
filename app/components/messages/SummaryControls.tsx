import type { SummaryWindow } from "@/types/messages";

const summaryWindows: Array<{ label: string; value: SummaryWindow }> = [
  { label: "Last week", value: "week" },
  { label: "Last 2 weeks", value: "two_weeks" },
  { label: "Last month", value: "month" },
  { label: "Last 100 messages", value: "last_100" },
];

export function SummaryControls({
  disabled,
  onRequestSummary,
}: {
  disabled: boolean;
  onRequestSummary: (windowType: SummaryWindow) => void;
}) {
  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        onRequestSummary(String(formData.get("window")) as SummaryWindow);
      }}
    >
      <select
        aria-label="Summary window"
        className="min-w-0 flex-1 rounded-md border border-border bg-white px-2 py-1.5 text-xs text-ink"
        name="window"
      >
        {summaryWindows.map((window) => (
          <option key={window.value} value={window.value}>
            {window.label}
          </option>
        ))}
      </select>
      <button
        className="rounded-md border border-accent bg-accent px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
        disabled={disabled}
        type="submit"
      >
        {disabled ? "Requesting..." : "Summarize"}
      </button>
    </form>
  );
}
