"use client";

import { useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { SourceEntry } from "@/types/sources";

export function SourcesLibrary({ entries }: { entries: SourceEntry[] }) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const tags = [...new Set(entries.flatMap((entry) => entry.tags))].sort();
  const needle = query.toLocaleLowerCase();
  const visible = entries.filter(
    (entry) =>
      (!tag || entry.tags.includes(tag)) &&
      `${entry.source_text} ${entry.creator || ""} ${entry.context || ""} ${entry.tags.join(" ")}`
        .toLocaleLowerCase()
        .includes(needle),
  );
  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <h1 className="text-sm font-semibold">Sources</h1>
        <span className="text-xs tabular-nums text-muted-foreground">
          {entries.length}
        </span>
      </header>
      <div className="flex shrink-0 items-center gap-2 border-b border-border p-3">
        <label className="relative max-w-sm flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Search sources"
            placeholder="Find a source"
            className="h-8 rounded-sm pl-7 text-[13px] shadow-none"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <NativeSelect
          aria-label="Source tag"
          className="h-8 rounded-sm text-xs"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
        >
          <option value="">All tags</option>
          {tags.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="eidos-v2-scroll min-h-0 flex-1 overflow-y-auto">
        <ul className="divide-y divide-border">
          {visible.map((entry) => (
            <li key={entry.id} className="px-4 py-4 sm:px-6">
              <div className="flex items-baseline justify-between gap-4">
                {entry.url && /^https?:\/\//.test(entry.url) ? (
                  <a
                    href={entry.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-baseline gap-2 text-[13px] font-medium underline-offset-4 hover:underline"
                  >
                    {entry.source_text}
                    <ArrowUpRight className="size-3 shrink-0" aria-hidden />
                  </a>
                ) : (
                  <h2 className="text-[13px] font-medium">
                    {entry.source_text}
                  </h2>
                )}
                <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:block">
                  {entry.type}
                </span>
              </div>
              {(entry.creator || entry.year) && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {[entry.creator, entry.year].filter(Boolean).join(" · ")}
                </p>
              )}
              {entry.context && (
                <p className="mt-2 max-w-3xl text-[13px] leading-relaxed">
                  {entry.context}
                </p>
              )}
              {entry.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                  {entry.tags.map((value) => (
                    <button
                      type="button"
                      key={value}
                      onClick={() => setTag(value)}
                      className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                    >
                      {value}
                    </button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
        {!visible.length && (
          <p className="p-4 text-xs text-muted-foreground">
            {entries.length ? "No matching sources." : "No sources saved yet."}
          </p>
        )}
      </div>
    </section>
  );
}
