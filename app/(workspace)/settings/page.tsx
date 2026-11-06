import { AgentSettings } from "@/components/v2/AgentSettings";

export default function SettingsPage() {
  return (
    <section aria-label="Settings" className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center border-b border-border px-5">
        <h1 className="text-sm font-semibold">Settings</h1>
      </header>
      <div className="eidos-v2-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-1 py-4 sm:px-5">
          <AgentSettings />
        </div>
      </div>
    </section>
  );
}
