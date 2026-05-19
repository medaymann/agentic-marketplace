import type { ColumnType, Generated } from "kysely";

// Postgres `numeric` columns come back as strings via node-postgres.
// We surface them as bigint at the query boundary; here the storage type is string.
type Numeric = ColumnType<string, string | bigint, string | bigint>;

export interface AgentsTable {
  wallet: string;
  api_key_hash: string | null;
  webhook_secret: string | null;
  name: string;
  description: string;
  capabilities: ColumnType<string, string | undefined, string>;
  capability_tags: ColumnType<string[], string[] | undefined, string[]>;
  endpoint_url: string;
  comms_modes: string[];
  max_response_seconds: ColumnType<number, number | undefined, number>;
  default_max_delivery_seconds: ColumnType<number, number | undefined, number>;
  supported_currencies: string[];
  min_task_reward_usdc: ColumnType<string, string | bigint | undefined, string | bigint>;
  status: ColumnType<string, string | undefined, string>;
  registration_stage: ColumnType<string, string | undefined, string>;
  last_health_check_at: Date | null;
  consecutive_health_failures: ColumnType<number, number | undefined, number>;
  input_schema: ColumnType<unknown | null, unknown | null | undefined, unknown | null>;
  created_at: ColumnType<Date, Date | string | undefined, never>;
}

export interface TasksTable {
  task_id: string;
  poster_wallet: string;
  poster_kind: string;
  assigned_agent: string | null;
  mode: string;
  title: string;
  description: string;
  acceptance_criteria: string[];
  currency: string;
  amount: Numeric;
  deadline: Date;
  status: ColumnType<string, string | undefined, string>;
  created_at: ColumnType<Date, Date | string | undefined, never>;
  submitted_at: Date | null;
  settled_at: Date | null;
  task_pda: ColumnType<string | null, string | null | undefined, string | null>;
  typed_inputs: ColumnType<unknown | null, unknown | null | undefined, unknown | null>;
  input_schema_snapshot: ColumnType<unknown | null, unknown | null | undefined, unknown | null>;
  capability_tags: ColumnType<string[], string[] | undefined, string[]>;
}

export interface BountyApplicationsTable {
  id: Generated<string>;
  task_id: string;
  agent_wallet: string;
  message: string;
  status: ColumnType<string, string | undefined, string>;
  created_at: ColumnType<Date, Date | string | undefined, never>;
}

export interface DeliverablesTable {
  id: Generated<string>;
  task_id: string;
  agent_wallet: string;
  content_text: ColumnType<string, string | undefined, string>;
  file_urls: ColumnType<string[], string[] | undefined, string[]>;
  files: ColumnType<unknown[], unknown[] | undefined, unknown[]>;
  external_links: ColumnType<unknown[], unknown[] | undefined, unknown[]>;
  status: ColumnType<string, string | undefined, string>;
  submitted_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface JudgeVerdictsTable {
  id: Generated<string>;
  task_id: string;
  verdict: string;
  confidence: ColumnType<string, string | number, string | number>;
  reasoning: string;
  failed_criteria: ColumnType<string[], string[] | undefined, string[]>;
  model: string;
  prompt_version: string;
  created_at: ColumnType<Date, Date | string | undefined, never>;
}

export interface DisputesTable {
  id: Generated<string>;
  task_id: string;
  opened_by: string;
  reason: string;
  agent_response: string | null;
  evidence_urls: ColumnType<string[], string[] | undefined, string[]>;
  ruling: string | null;
  ruling_notes: string | null;
  opened_at: ColumnType<Date, Date | string | undefined, never>;
  resolved_at: Date | null;
}

export interface WebhookDeliveriesTable {
  id: Generated<string>;
  agent_wallet: string;
  event: string;
  payload: ColumnType<unknown, unknown, unknown>;
  status: ColumnType<string, string | undefined, string>;
  attempts: ColumnType<number, number | undefined, number>;
  last_error: string | null;
  next_retry_at: Date | null;
  created_at: ColumnType<Date, Date | string | undefined, never>;
  delivered_at: Date | null;
}

export interface SettlementsTable {
  id: Generated<string>;
  task_id: string;
  kind: string;
  recipient_wallet: string;
  currency: string;
  amount: Numeric;
  tx_signature: string;
  created_at: ColumnType<Date, Date | string | undefined, never>;
}

export interface SessionsTable {
  token: string;
  kind: string;
  wallet: string | null;
  data: ColumnType<unknown, unknown, unknown>;
  expires_at: Date;
  created_at: ColumnType<Date, Date | string | undefined, never>;
}

export interface NoncesTable {
  value: string;
  consumed_at: ColumnType<Date, Date | string | undefined, never>;
}

export interface DaemonStateTable {
  id: ColumnType<number, number | undefined, never>;
  last_seen_slot: ColumnType<string, string | bigint | undefined, string | bigint>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface Database {
  agents: AgentsTable;
  tasks: TasksTable;
  bounty_applications: BountyApplicationsTable;
  deliverables: DeliverablesTable;
  judge_verdicts: JudgeVerdictsTable;
  disputes: DisputesTable;
  webhook_deliveries: WebhookDeliveriesTable;
  settlements: SettlementsTable;
  sessions: SessionsTable;
  nonces: NoncesTable;
  daemon_state: DaemonStateTable;
}
