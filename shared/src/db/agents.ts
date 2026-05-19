import type { Selectable } from "kysely";
import { sql } from "kysely";
import { getDb } from "./kysely";
import type { AgentsTable } from "./types";

export type AgentRecord = Selectable<AgentsTable>;

export interface InsertPendingAgentInput {
  wallet: string;
  name: string;
  description: string;
  capabilities: string;
  capabilityTags: string[];
  endpointUrl: string;
  maxResponseSeconds: number;
  defaultMaxDeliverySeconds: number;
  supportedCurrencies: string[];
  minTaskRewardUsdc: bigint;
  inputSchema?: unknown | null;
}

export async function insertPendingAgent(
  input: InsertPendingAgentInput,
): Promise<void> {
  await getDb()
    .insertInto("agents")
    .values({
      wallet: input.wallet,
      name: input.name,
      description: input.description,
      capabilities: input.capabilities,
      capability_tags: input.capabilityTags,
      endpoint_url: input.endpointUrl,
      max_response_seconds: input.maxResponseSeconds,
      default_max_delivery_seconds: input.defaultMaxDeliverySeconds,
      supported_currencies: input.supportedCurrencies,
      min_task_reward_usdc: input.minTaskRewardUsdc.toString(),
      status: "active",
      registration_stage: "pending",
      input_schema: input.inputSchema ?? null,
    })
    .execute();
}

export async function setAgentInputSchema(
  wallet: string,
  inputSchema: unknown | null,
): Promise<void> {
  await getDb()
    .updateTable("agents")
    .set({ input_schema: inputSchema })
    .where("wallet", "=", wallet)
    .execute();
}

export async function setRegistrationStage(
  wallet: string,
  stage: "pending" | "wallet_verified" | "endpoint_verified" | "complete",
): Promise<void> {
  await getDb()
    .updateTable("agents")
    .set({ registration_stage: stage })
    .where("wallet", "=", wallet)
    .execute();
}

export async function setApiKeyHash(
  wallet: string,
  apiKeyHash: string,
  webhookSecret: string,
): Promise<void> {
  await getDb()
    .updateTable("agents")
    .set({
      api_key_hash: apiKeyHash,
      webhook_secret: webhookSecret,
      registration_stage: "complete",
    })
    .where("wallet", "=", wallet)
    .execute();
}

export async function rotateApiKeyHash(
  wallet: string,
  apiKeyHash: string,
): Promise<void> {
  await getDb()
    .updateTable("agents")
    .set({ api_key_hash: apiKeyHash })
    .where("wallet", "=", wallet)
    .execute();
}

export async function getAgentByWallet(
  wallet: string,
): Promise<AgentRecord | undefined> {
  return getDb()
    .selectFrom("agents")
    .selectAll()
    .where("wallet", "=", wallet)
    .executeTakeFirst();
}

export async function listActiveAgents(): Promise<AgentRecord[]> {
  return getDb()
    .selectFrom("agents")
    .selectAll()
    .where("status", "=", "active")
    .where("registration_stage", "=", "complete")
    .execute();
}

/**
 * Active, fully-registered agents whose declared capability_tags overlap the
 * given tags. Used to pick task.created webhook recipients. Returns nothing
 * for an empty tag list (a bounty with no tags targets no one).
 */
export async function listActiveAgentsByTags(
  tags: string[],
): Promise<AgentRecord[]> {
  if (tags.length === 0) return [];
  return getDb()
    .selectFrom("agents")
    .selectAll()
    .where("status", "=", "active")
    .where("registration_stage", "=", "complete")
    .where(sql<boolean>`capability_tags && ${sql.val(tags)}::text[]`)
    .execute();
}

export async function setStatus(
  wallet: string,
  status: "active" | "inactive",
): Promise<void> {
  await getDb()
    .updateTable("agents")
    .set({ status })
    .where("wallet", "=", wallet)
    .execute();
}

export async function recordHealthCheck(
  wallet: string,
  at: Date,
): Promise<void> {
  await getDb()
    .updateTable("agents")
    .set({ last_health_check_at: at, consecutive_health_failures: 0 })
    .where("wallet", "=", wallet)
    .execute();
}

export async function incrementHealthFailure(wallet: string): Promise<number> {
  const result = await getDb()
    .updateTable("agents")
    .set((eb) => ({
      consecutive_health_failures: eb("consecutive_health_failures", "+", 1),
    }))
    .where("wallet", "=", wallet)
    .returning("consecutive_health_failures")
    .executeTakeFirst();
  return result?.consecutive_health_failures ?? 0;
}
