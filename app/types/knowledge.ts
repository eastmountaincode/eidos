import type { AgentCapability } from './capabilities';
import type { SourceEntry } from './sources';

export type Capability = AgentCapability & {
  instructions: string | null;
  requirements: string | null;
  limitations: string | null;
  last_check: { result: 'passed' | 'failed'; evidence: string; checked_at: string } | null;
};
export type Feedback = {
  id: string;
  kind: 'preference' | 'decision' | 'issue';
  title: string;
  body: string;
  scope: string;
  source_ref: string;
  source_quote: string;
  status: 'active' | 'open' | 'resolved' | 'withdrawn';
  resolution: string;
  revision: number;
  created_at: string;
  updated_at: string;
};
export type Knowledge = {
  capabilities: Capability[];
  feedback: Feedback[];
  has_more: boolean;
  sources: SourceEntry[];
  sources_has_more: boolean;
  runtime: { agent_online: boolean; observed_at: string };
  portal: { branch: string; revision: string };
};
