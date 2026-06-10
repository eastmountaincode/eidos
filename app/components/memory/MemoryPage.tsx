"use client";

import { useEffect, useState } from "react";
import type { HistoryEntry, MemoryNote, MemoryResponse, PeopleNote } from "@/types/memory";

type MemoryTab = "persistent" | "history";

export function MemoryPage({ initialMemory }: { initialMemory: MemoryResponse }) {
  const [memory, setMemory] = useState(initialMemory);
  const [activeTab, setActiveTab] = useState<MemoryTab>("persistent");
  const [selectedDate, setSelectedDate] = useState(initialMemory.activeDate || initialMemory.dates[0]?.entry_date || "");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const memoryNotes = memory.memoryNotes ?? [];
  const peopleNotes = memory.peopleNotes ?? [];

  useEffect(() => {
    if (!selectedDate || selectedDate === memory.activeDate) return;

    let cancelled = false;
    setIsLoading(true);
    setError("");

    fetch(`/api/memory?date=${encodeURIComponent(selectedDate)}`, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<MemoryResponse>;
      })
      .then((nextMemory) => {
        if (!cancelled) setMemory(nextMemory);
      })
      .catch((nextError) => {
        if (!cancelled) setError(`Could not load memory for ${selectedDate}: ${String(nextError)}`);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [memory.activeDate, selectedDate]);

  return (
    <div className="grid gap-4">
      <header>
        <h2 className="text-[26px] font-bold leading-tight">Memory</h2>
        <p className="mt-1 text-sm text-muted">Persistent facts and date-based history from meaningful events, conversations, and things Andrew processed.</p>
      </header>

      <MemoryTabs activeTab={activeTab} onSelect={setActiveTab} />

      {activeTab === "persistent" ? (
        memoryNotes.length || peopleNotes.length ? (
          <PersistentMemory memoryNotes={memoryNotes} peopleNotes={peopleNotes} />
        ) : (
          <EmptyPersistentMemory />
        )
      ) : memory.dates.length ? (
        <section className="grid items-start gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
          <DateList dates={memory.dates} selectedDate={selectedDate} onSelect={setSelectedDate} />
          <MemoryEntries date={selectedDate} entries={memory.entries} error={error} isLoading={isLoading} />
        </section>
      ) : (
        <EmptyHistoryMemory />
      )}
    </div>
  );
}

function MemoryTabs({ activeTab, onSelect }: { activeTab: MemoryTab; onSelect: (tab: MemoryTab) => void }) {
  const tabs: Array<{ id: MemoryTab; label: string }> = [
    { id: "persistent", label: "Persistent Memory" },
    { id: "history", label: "Daily History" },
  ];

  return (
    <div className="inline-grid w-full grid-cols-2 rounded-lg border border-border bg-white p-1 sm:w-fit" role="tablist" aria-label="Memory sections">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            aria-selected={isActive}
            className={`min-h-9 rounded-md px-3 text-sm font-bold transition-colors ${
              isActive ? "bg-sidebar text-white" : "text-muted hover:bg-[#f4f8f7] hover:text-ink"
            }`}
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function PersistentMemory({ memoryNotes, peopleNotes }: { memoryNotes: MemoryNote[]; peopleNotes: PeopleNote[] }) {
  return (
    <section className="grid gap-2">
      <div>
        <h3 className="text-[18px] font-bold">Persistent Memory</h3>
        <p className="mt-0.5 text-sm text-muted">Durable facts, preferences, people context, and profile-level notes.</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {memoryNotes.map((note) => (
          <article className="rounded-lg border border-border bg-white p-3" key={note.id}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="text-[15px] font-bold">{note.title}</h4>
              <span className="rounded-full bg-[#edf5f3] px-2 py-0.5 text-[11px] font-bold text-accent">{note.profile}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted">{note.body}</p>
            <NoteMeta note={note} />
          </article>
        ))}

        {peopleNotes.map((note) => (
          <article className="rounded-lg border border-border bg-white p-3" key={note.id}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="text-[15px] font-bold">{note.person_name}</h4>
              <span className="rounded-full bg-[#f8eee9] px-2 py-0.5 text-[11px] font-bold text-accent-2">person</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted">{note.body}</p>
            <NoteMeta note={note} />
          </article>
        ))}
      </div>
    </section>
  );
}

function NoteMeta({ note }: { note: MemoryNote | PeopleNote }) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-border pt-2 text-[11px] text-soft">
      {note.source_label ? <span>{note.source_label}</span> : null}
      {note.updated_at ? <span>Updated {formatDateTime(note.updated_at)}</span> : null}
    </div>
  );
}

function DateList({
  dates,
  onSelect,
  selectedDate,
}: {
  dates: MemoryResponse["dates"];
  selectedDate: string;
  onSelect: (date: string) => void;
}) {
  return (
    <aside className="rounded-lg border border-border bg-white p-2">
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1">
        {dates.map((date) => {
          const isSelected = date.entry_date === selectedDate;
          return (
            <button
              className={`flex min-h-11 items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm ${
                isSelected ? "bg-[#edf5f3] text-ink" : "text-muted hover:bg-[#f4f8f7] hover:text-ink"
              }`}
              key={date.entry_date}
              onClick={() => onSelect(date.entry_date)}
              type="button"
            >
              <span className="font-bold">{formatMemoryDate(date.entry_date)}</span>
              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-soft">{date.entry_count}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function MemoryEntries({
  date,
  entries,
  error,
  isLoading,
}: {
  date: string;
  entries: HistoryEntry[];
  error: string;
  isLoading: boolean;
}) {
  return (
    <section className="rounded-lg border border-border bg-white p-3">
      <div className="mb-3 border-b border-border pb-2">
        <h3 className="text-[18px] font-bold">{formatMemoryDate(date)}</h3>
      </div>

      {isLoading ? (
        <p className="rounded-lg border border-dashed border-border bg-white/60 p-4 text-sm text-muted">Loading memory...</p>
      ) : error ? (
        <p className="rounded-lg border border-dashed border-border bg-white/60 p-4 text-sm text-red-700">{error}</p>
      ) : entries.length ? (
        <div className="grid gap-3">
          {entries.map((entry) => (
            <article className="grid gap-1.5 border-b border-border pb-3 last:border-0 last:pb-0" key={entry.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h4 className="text-[15px] font-bold">{entry.title}</h4>
                {entry.source_label ? <span className="text-[11px] font-bold text-soft">{entry.source_label}</span> : null}
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{entry.body}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border bg-white/60 p-4 text-sm text-muted">No entries for this date yet.</p>
      )}
    </section>
  );
}

function EmptyPersistentMemory() {
  return (
    <section className="rounded-lg border border-dashed border-border bg-white/70 p-4">
      <h3 className="text-sm font-bold">No persistent memory yet</h3>
      <p className="mt-1 text-sm text-muted">
        Eidos can store durable facts, preferences, and people context here when they should survive beyond a dated history entry.
      </p>
    </section>
  );
}

function EmptyHistoryMemory() {
  return (
    <section className="rounded-lg border border-dashed border-border bg-white/70 p-4">
      <h3 className="text-sm font-bold">No daily history yet</h3>
      <p className="mt-1 text-sm text-muted">Daily history stays empty unless something meaningful is worth keeping for a specific date.</p>
    </section>
  );
}

function formatMemoryDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(value: string) {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const date = new Date(normalized.endsWith("Z") ? normalized : `${normalized}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
