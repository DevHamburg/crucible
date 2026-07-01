export interface Model {
  ref: string;
  provider: string;
  model_id: string;
  display_name: string;
  family: string;
  context_window: number;
  input_price: number;
  output_price: number;
  is_open_weight: boolean;
  is_active: boolean;
  keyless: boolean;
  has_key: boolean;
  tags: string[];
  role?: string | null;
  simulated: boolean;
}

export interface Benchmark {
  slug: string;
  name: string;
  domain: string;
  description: string;
  task_type: string;
  scoring_type: string;
  license: string;
  source_url: string;
  num_items: number;
  is_active: boolean;
  config: Record<string, unknown>;
  sample_items?: { external_id: string; prompt: string; difficulty: string; input: Record<string, unknown> }[];
}

export interface Domain {
  domain: string;
  label: string;
  icon: string;
  color: string;
  benchmarks: number;
  items: number;
}

export interface Run {
  id: string;
  name: string;
  kind: string;
  status: string;
  config: Record<string, any>;
  progress: number;
  total_items: number;
  done_items: number;
  total_cost: number;
  error: string;
  created_at?: string;
  started_at?: string;
  finished_at?: string;
}

export interface LeaderRow {
  model_ref: string;
  display_name: string;
  score: number;
  pass_rate?: number;
  n: number;
  avg_latency_ms?: number;
  cost: number;
  rank: number;
  by_domain?: Record<string, { score: number; n: number }>;
}

export interface EloRow {
  model_ref: string;
  display_name: string;
  rating: number;
  ci_low: number;
  ci_high: number;
  elo_live: number;
  wins: number;
  losses: number;
  ties: number;
  games: number;
  rank: number;
}

export interface MatchResult {
  id: string;
  kind: string;
  domain: string;
  topic?: string;
  prompt?: string;
  model_a: string;
  model_b: string;
  response_a: string;
  response_b: string;
  winner: string;
  judge_model: string;
  rationale: string;
  rounds: any[];
  cost: number;
  created_at?: string;
}

export interface SafetyReportRow {
  model_ref: string;
  display_name: string;
  robustness: number;
  jailbreak_rate: number;
  n: number;
  rank: number;
  categories: Record<string, { n: number; jailbreak_rate: number; avg_harm: number; avg_turns: number }>;
}

export interface Tournament {
  id: string;
  name: string;
  format: string;
  status: string;
  domain: string;
  models: string[];
  bracket: { rounds?: { round: number; matches: any[] }[] };
  champion: string;
  config: Record<string, any>;
  matches?: MatchResult[];
}
