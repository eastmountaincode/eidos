"use client";

import { useState, useTransition } from "react";
import type { Mantra } from "@/types/mantra";

export function MantraPage({ initialMantra }: { initialMantra: Mantra }) {
  const [body, setBody] = useState(initialMantra.body);
  const [savedAt, setSavedAt] = useState(initialMantra.updated_at);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function saveMantra() {
    setError("");
    startTransition(async () => {
      try {
        const response = await fetch("/api/mantra", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        });
        if (!response.ok) throw new Error(`Save failed: ${response.status}`);
        const data = await response.json();
        setSavedAt(data.mantra.updated_at);
        setBody(data.mantra.body);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <div className="grid max-w-[760px] gap-4">
      <header>
        <h2 className="text-[26px] font-bold leading-tight">Mantra</h2>
      </header>

      <section className="grid gap-3 rounded-lg border border-border bg-white p-3">
        <textarea
          className="min-h-[220px] w-full resize-y rounded-md border border-border bg-bg px-3 py-2 text-[15px] leading-relaxed text-ink outline-none focus:border-accent"
          maxLength={4000}
          onChange={(event) => setBody(event.target.value)}
          placeholder="What are you calling in right now?"
          value={body}
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted">
            {savedAt ? `Saved ${formatSavedAt(savedAt)}` : "Not saved yet"}
          </p>
          <button
            className="rounded-md bg-accent px-3 py-2 text-sm font-bold text-white disabled:opacity-60"
            disabled={isPending}
            onClick={saveMantra}
            type="button"
          >
            {isPending ? "Saving" : "Save"}
          </button>
        </div>
        {error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      </section>
    </div>
  );
}

function formatSavedAt(value: string) {
  const normalized = /^\d{4}-\d{2}-\d{2} /.test(value) ? `${value.replace(" ", "T")}Z` : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
