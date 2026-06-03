export type CapabilityKind = "tool" | "skill";

export type CapabilityStatus = "active" | "planned" | "stub" | string;

export type AgentCapability = {
  id: string;
  kind: CapabilityKind;
  name: string;
  status: CapabilityStatus;
  category?: string | null;
  summary: string;
  invocation?: string | null;
  data_source?: string | null;
  notes?: string | null;
  sort_order?: number | null;
  updated_at?: string | null;
};

export type CapabilitiesResponse = {
  capabilities: AgentCapability[];
};
