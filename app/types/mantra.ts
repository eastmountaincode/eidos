export type Mantra = {
  id: "current";
  body: string;
  created_at: string | null;
  updated_at: string | null;
};

export type MantraResponse = {
  mantra: Mantra;
};
