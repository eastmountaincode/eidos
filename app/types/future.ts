export type FutureEvent = {
  id: string;
  name: string;
  url: string | null;
  description: string | null;
  location: string | null;
  cadence: string;
  last_start: string | null;
  last_end: string | null;
  next_start: string | null;
  next_end: string | null;
  watch_month: number | null;
  status: "watching" | "announced" | "going" | "archived";
  notes: string | null;
  tags: string[];
  added_at: string;
  updated_at: string;
};

export type FutureEventsResponse = { entries: FutureEvent[] };
