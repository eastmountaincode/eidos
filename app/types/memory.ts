export type HistoryDateGroup = {
  entry_date: string;
  entry_count: number;
  updated_at?: string | null;
};

export type HistoryEntry = {
  id: string;
  entry_date: string;
  title: string;
  body: string;
  source_type?: string | null;
  source_label?: string | null;
  source_ref?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type MemoryNote = {
  id: string;
  profile: "personal" | "creative" | "bioinformatics" | string;
  title: string;
  body: string;
  status?: string | null;
  source_type?: string | null;
  source_label?: string | null;
  source_ref?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type PeopleNote = {
  id: string;
  person_key: string;
  person_name: string;
  body: string;
  status?: string | null;
  source_type?: string | null;
  source_label?: string | null;
  source_ref?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type MemoryResponse = {
  activeDate?: string | null;
  dates: HistoryDateGroup[];
  entries: HistoryEntry[];
  memoryNotes?: MemoryNote[];
  peopleNotes?: PeopleNote[];
};
