export type SourceEntry = {
  id: string;
  source_text: string;
  type: string | null;
  context: string | null;
  creator: string | null;
  year: string | null;
  url: string | null;
  file_path: string | null;
  preview_url: string | null;
  tags: string[];
  added_at: string;
  updated_at: string;
};

export type SourcesResponse = { entries: SourceEntry[] };
