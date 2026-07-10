export type StyleEntry = {
  id: string;
  source_text: string;
  kind: string | null;
  url: string | null;
  preview_url: string | null;
  captured_at: string | null;
  context: string | null;
  notes: string | null;
  tags: string[];
  file_path: string | null;
  created_at: string;
  updated_at: string;
};

export type StylesResponse = { entries: StyleEntry[] };
