CREATE TABLE IF NOT EXISTS future_events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT,
  description TEXT,
  location TEXT,
  cadence TEXT NOT NULL DEFAULT 'annual',
  last_start TEXT,
  last_end TEXT,
  next_start TEXT,
  next_end TEXT,
  watch_month INTEGER,
  status TEXT NOT NULL DEFAULT 'watching',
  notes TEXT,
  tags_json TEXT,
  added_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_future_events_status ON future_events(status, next_start, watch_month);

INSERT INTO future_events (id, name, url, description, location, cadence, last_start, last_end, watch_month, status, notes, tags_json)
VALUES
  ('vibecon', 'VibeCon', 'https://vibecon.ai/', 'A creative AI conference connecting code and culture through talks, workshops, and installations.', 'New York, NY', 'annual', '2026-06-17', '2026-06-18', 3, 'watching', 'Andrew wished he had caught the 2026 edition. Watch early for the next announcement and ticket release.', '["creative technology","AI","conference"]'),
  ('fwb-fest', 'FWB FEST', 'https://fwb.help/events', 'A gathering for artists, technologists, and internet-culture builders, with talks, performances, and shared experiences.', 'Idyllwild, CA', 'annual', '2026-07-31', '2026-08-02', 1, 'watching', 'The 2026 edition was the fifth FWB FEST. Start checking at the beginning of the year.', '["internet culture","art","technology","festival"]'),
  ('hardcore-art-book-fair', 'Hardcore Art Book Fair', 'https://hardcorefair.com/', 'An independent art-book fair focused on publishing, design, illustration, and print culture.', 'Mexico City, Mexico', 'annual', '2026-07-30', '2026-08-02', 3, 'watching', 'Produced by Can Can Press with LagoAlgo. Watch for exhibitor registration as well as public dates.', '["art books","publishing","design","fair"]')
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  url = excluded.url,
  description = excluded.description,
  location = excluded.location,
  cadence = excluded.cadence,
  last_start = excluded.last_start,
  last_end = excluded.last_end,
  watch_month = excluded.watch_month,
  notes = excluded.notes,
  tags_json = excluded.tags_json,
  updated_at = datetime('now');
