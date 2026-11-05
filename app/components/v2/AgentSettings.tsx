"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Plus, RefreshCw } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { Capability, Feedback, Knowledge } from "@/types/knowledge";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/knowledge${path}`, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Could not load this record.");
  return data;
}
function day(value: string) {
  return value.slice(0, 10);
}
function readable(value: string) {
  return value.replaceAll("_", " ");
}

export function AgentSettings() {
  const [data, setData] = useState<Knowledge | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    request<Knowledge>("", { signal: controller.signal })
      .then((value) => {
        setData(value);
        setError("");
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(String(reason.message));
      });
    return () => controller.abort();
  }, [reload]);
  const capabilities =
    data?.capabilities.filter((c) =>
      `${c.name} ${c.summary} ${c.category}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    ) || [];
  return (
    <div className="eidos-v2-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-6">
      {error && (
        <p role="alert" className="py-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {!data ? (
        <div className="py-4 text-sm text-muted-foreground">
          {error ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReload((n) => n + 1)}
            >
              Retry
            </Button>
          ) : (
            "Loading…"
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between py-2">
            <span className="text-xs text-muted-foreground">
              {data.runtime.agent_online ? "Agent connected" : "Agent offline"}
            </span>
            <Button
              aria-label="Refresh settings"
              variant="ghost"
              size="icon-sm"
              onClick={() => setReload((n) => n + 1)}
            >
              <RefreshCw className="size-3.5" />
            </Button>
          </div>
          <Tabs defaultValue="feedback">
            <TabsList
              aria-label="Settings sections"
              variant="line"
              className="mb-4 w-full justify-start border-b border-border"
            >
              <TabsTrigger
                value="feedback"
                className="flex-none px-2 text-[13px]"
              >
                Feedback
              </TabsTrigger>
              <TabsTrigger
                value="abilities"
                className="flex-none px-2 text-[13px]"
              >
                Abilities
              </TabsTrigger>
              <TabsTrigger
                value="connection"
                className="flex-none px-2 text-[13px]"
              >
                Connection
              </TabsTrigger>
            </TabsList>
            <TabsContent value="feedback">
              <FeedbackPanel key={reload} />
            </TabsContent>
            <TabsContent value="abilities">
              <Input
                aria-label="Find an ability"
                placeholder="Find an ability"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="mb-3 h-8 text-[13px]"
              />
              <Accordion type="multiple">
                {capabilities.map((capability) => (
                  <CapabilityRow key={capability.id} capability={capability} />
                ))}
              </Accordion>
              {!capabilities.length && (
                <p className="py-4 text-sm text-muted-foreground">
                  No matching abilities.
                </p>
              )}
            </TabsContent>
            <TabsContent
              value="connection"
              className="space-y-4 text-[13px] leading-relaxed"
            >
              <p>Web app → Cloudflare → Mac mini</p>
              <dl className="grid grid-cols-[80px_1fr] gap-2">
                <dt className="text-muted-foreground">Branch</dt>
                <dd className="break-all">{data.portal.branch}</dd>
                <dt className="text-muted-foreground">Revision</dt>
                <dd>{data.portal.revision}</dd>
                <dt className="text-muted-foreground">Checked</dt>
                <dd>
                  {data.runtime.observed_at.replace("T", " ").slice(0, 19)} UTC
                </dd>
              </dl>
              <p className="text-xs text-muted-foreground">
                Connection status does not verify individual abilities. The
                original production site is separate.
              </p>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function CapabilityRow({ capability: c }: { capability: Capability }) {
  const details = [
    ["Requirements", c.requirements || c.data_source],
    ["Procedure", c.instructions],
    ["Invocation", c.invocation],
    ["Limitations", c.limitations],
    ["Registry notes", c.notes],
  ];
  return (
    <AccordionItem value={c.id}>
      <AccordionTrigger className="hover:no-underline">
        <span className="min-w-0">
          <span className="block font-medium">{c.name}</span>
          <span className="mt-1 block text-xs font-normal text-muted-foreground">
            Declared {readable(c.status)} ·{" "}
            {c.last_check
              ? `Check ${c.last_check.result}, ${day(c.last_check.checked_at)}`
              : "No dated check recorded"}
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="space-y-4 leading-relaxed">
        <p>{c.summary}</p>
        {details
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label}>
              <h3 className="mb-1 text-xs font-medium text-muted-foreground">
                {label}
              </h3>
              <p
                className={`whitespace-pre-wrap break-words ${label === "Invocation" ? "rounded-md bg-muted p-3 font-mono text-xs" : ""}`}
              >
                {value}
              </p>
            </div>
          ))}
        {c.last_check && (
          <div>
            <h3 className="mb-1 text-xs font-medium text-muted-foreground">
              Last verification · {day(c.last_check.checked_at)}
            </h3>
            <p>{c.last_check.evidence}</p>
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

function FeedbackPanel() {
  const [rows, setRows] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [includePast, setIncludePast] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<Partial<Feedback> | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    request<{ feedback: Feedback[]; has_more: boolean; next_offset: number }>(
      "/feedback?status=all",
      { signal: controller.signal },
    )
      .then((value) => {
        setRows(value.feedback);
        setHasMore(value.has_more);
        setOffset(value.next_offset);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);
  async function loadMore() {
    setLoading(true);
    setError("");
    try {
      const value = await request<{
        feedback: Feedback[];
        has_more: boolean;
        next_offset: number;
      }>(`/feedback?status=all&offset=${offset}`);
      setRows((previous) => [
        ...new Map(
          [...previous, ...value.feedback].map((row) => [row.id, row]),
        ).values(),
      ]);
      setHasMore(value.has_more);
      setOffset(value.next_offset);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  }
  const visible = rows.filter(
    (r) => includePast || r.status === "active" || r.status === "open",
  );
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setEditing({
              id: crypto.randomUUID(),
              kind: "preference",
              scope: "eidos",
              source_ref: "eidos-ui:settings",
            })
          }
          disabled={!!editing}
        >
          <Plus />
          Add feedback
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={includePast}
          onClick={() => setIncludePast((value) => !value)}
        >
          {includePast ? "Hide past feedback" : "Include past feedback"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {editing && (
        <FeedbackForm
          initial={editing}
          onCancel={() => setEditing(null)}
          onSaved={(entry) => {
            setRows((previous) => [
              entry,
              ...previous.filter((r) => r.id !== entry.id),
            ]);
            setEditing(null);
          }}
        />
      )}
      <Accordion type="multiple">
        {visible.map((row) => (
          <AccordionItem key={row.id} value={row.id}>
            <AccordionTrigger className="hover:no-underline">
              <span>
                <span className="block">{row.title}</span>
                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                  {row.kind} · {row.scope} · {row.status}
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-3 text-sm leading-relaxed">
              <p className="whitespace-pre-wrap">{row.body}</p>
              {row.source_quote && (
                <blockquote className="border-l-2 border-border pl-3 text-muted-foreground">
                  {row.source_quote}
                </blockquote>
              )}
              <p className="break-words text-xs text-muted-foreground">
                Source: {row.source_ref} · {day(row.created_at)}
              </p>
              {row.resolution && (
                <p>
                  <span className="font-medium">Verification: </span>
                  {row.resolution}
                </p>
              )}
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!editing}
                  onClick={() => setEditing(row)}
                >
                  Edit
                </Button>
                <RevisionHistory id={row.id} revision={row.revision} />
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      {loading && (
        <p role="status" className="py-4 text-sm text-muted-foreground">
          Loading feedback…
        </p>
      )}
      {!loading && !visible.length && !error && (
        <p className="py-4 text-sm text-muted-foreground">
          No current feedback.
        </p>
      )}
      {hasMore && (
        <Button
          className="mt-4"
          variant="outline"
          disabled={loading}
          onClick={loadMore}
        >
          Load more
        </Button>
      )}
    </>
  );
}

function FeedbackForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial: Partial<Feedback>;
  onCancel: () => void;
  onSaved: (entry: Feedback) => void;
}) {
  const [kind, setKind] = useState(initial.kind || "preference");
  const [status, setStatus] = useState(initial.status || "active");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const result = await request<{ entry: Feedback }>(
        `/feedback${initial.revision ? `/${initial.id}` : ""}`,
        {
          method: initial.revision ? "PATCH" : "POST",
          body: JSON.stringify({ ...initial, ...fields, kind, status }),
        },
      );
      onSaved(result.entry);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={save}
      className="mb-5 grid gap-3 rounded-sm border border-border p-3"
    >
      <h2 className="text-sm font-medium">
        {initial.revision ? "Edit feedback" : "New feedback"}
      </h2>
      <fieldset disabled={busy} className="grid gap-3">
        <label className="grid gap-1.5 text-xs">
          Type
          <NativeSelect
            value={kind}
            disabled={!!initial.revision}
            onChange={(e) => {
              const next = e.target.value as Feedback["kind"];
              setKind(next);
              setStatus(next === "issue" ? "open" : "active");
            }}
          >
            <option value="preference">Preference</option>
            <option value="decision">Decision</option>
            <option value="issue">Issue</option>
          </NativeSelect>
        </label>
        <label className="grid gap-1.5 text-xs">
          Title
          <Input
            name="title"
            defaultValue={initial.title}
            required
            maxLength={160}
            autoFocus
          />
        </label>
        <label className="grid gap-1.5 text-xs">
          Details
          <Textarea
            name="body"
            defaultValue={initial.body}
            required
            maxLength={5000}
            rows={3}
          />
        </label>
        <label className="grid gap-1.5 text-xs">
          Applies to
          <Input
            name="scope"
            defaultValue={initial.scope}
            required
            maxLength={100}
          />
        </label>
        {initial.revision && (
          <label className="grid gap-1.5 text-xs">
            Status
            <NativeSelect
              value={status}
              onChange={(e) => setStatus(e.target.value as Feedback["status"])}
            >
              {kind === "issue" ? (
                <>
                  <option value="open">Open</option>
                  <option value="resolved">Resolved</option>
                </>
              ) : (
                <option value="active">Active</option>
              )}
              <option value="withdrawn">Withdrawn</option>
            </NativeSelect>
          </label>
        )}
        {status === "resolved" && (
          <label className="grid gap-1.5 text-xs">
            Verification
            <Textarea
              name="resolution"
              defaultValue={initial.resolution}
              required
              maxLength={3000}
              placeholder="What was tested, and what happened?"
            />
          </label>
        )}
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function RevisionHistory({ id, revision }: { id: string; revision: number }) {
  const [history, setHistory] = useState<Array<{
    revision: number;
    recorded_at: string;
    snapshot: Partial<Feedback>;
  }> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    setError("");
    try {
      setHistory(
        (
          await request<{ revisions: NonNullable<typeof history> }>(
            `/feedback/${id}`,
          )
        ).revisions,
      );
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="min-w-0 flex-1">
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() => (history ? setHistory(null) : load())}
      >
        {history ? "Hide history" : `History (${revision})`}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {history && (
        <ol className="mt-3 space-y-3 border-l border-border pl-3 text-xs text-muted-foreground">
          {history.map((h) => (
            <li key={h.revision}>
              <Badge variant="outline">Revision {h.revision}</Badge>
              <span className="ml-2">
                {day(h.recorded_at)} · {h.snapshot.status}
              </span>
              <p className="mt-1">{h.snapshot.title}</p>
              <p>{h.snapshot.body}</p>
              {h.snapshot.resolution && (
                <p>Verification: {h.snapshot.resolution}</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
