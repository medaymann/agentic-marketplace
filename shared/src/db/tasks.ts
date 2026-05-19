import type { Selectable } from "kysely";
import { getDb } from "./kysely";
import type { TasksTable } from "./types";

export type TaskRecord = Selectable<TasksTable>;

export interface InsertTaskInput {
  taskId: string;
  posterWallet: string;
  posterKind: "human" | "registered_agent" | "outside_agent";
  assignedAgent: string | null;
  mode: "direct" | "bounty";
  title: string;
  description: string;
  acceptanceCriteria: string[];
  currency: "SOL" | "USDC";
  amount: bigint;
  deadline: Date;
  status: string;
  taskPda?: string;
  typedInputs?: unknown | null;
  inputSchemaSnapshot?: unknown | null;
  capabilityTags?: string[];
}

export async function insertTask(input: InsertTaskInput): Promise<void> {
  await getDb()
    .insertInto("tasks")
    .values({
      task_id: input.taskId,
      poster_wallet: input.posterWallet,
      poster_kind: input.posterKind,
      assigned_agent: input.assignedAgent,
      mode: input.mode,
      title: input.title,
      description: input.description,
      acceptance_criteria: input.acceptanceCriteria,
      currency: input.currency,
      amount: input.amount.toString(),
      deadline: input.deadline,
      status: input.status,
      task_pda: input.taskPda ?? null,
      typed_inputs: input.typedInputs ?? null,
      input_schema_snapshot: input.inputSchemaSnapshot ?? null,
      capability_tags: input.capabilityTags ?? [],
    })
    .execute();
}

export async function getTaskByPda(
  pda: string,
): Promise<TaskRecord | undefined> {
  return getDb()
    .selectFrom("tasks")
    .selectAll()
    .where("task_pda", "=", pda)
    .executeTakeFirst();
}

export async function getTaskById(
  taskId: string,
): Promise<TaskRecord | undefined> {
  return getDb()
    .selectFrom("tasks")
    .selectAll()
    .where("task_id", "=", taskId)
    .executeTakeFirst();
}

export async function setTaskStatus(
  taskId: string,
  status: string,
): Promise<void> {
  await getDb()
    .updateTable("tasks")
    .set({ status })
    .where("task_id", "=", taskId)
    .execute();
}

export async function setSubmittedAt(
  taskId: string,
  at: Date,
): Promise<void> {
  await getDb()
    .updateTable("tasks")
    .set({ submitted_at: at, status: "submitted" })
    .where("task_id", "=", taskId)
    .execute();
}

export async function setSettledAt(taskId: string, at: Date): Promise<void> {
  await getDb()
    .updateTable("tasks")
    .set({ settled_at: at })
    .where("task_id", "=", taskId)
    .execute();
}

export async function setAssignedAgent(
  taskId: string,
  wallet: string,
): Promise<void> {
  await getDb()
    .updateTable("tasks")
    .set({ assigned_agent: wallet, status: "assigned" })
    .where("task_id", "=", taskId)
    .execute();
}

export interface ListBountiesFilter {
  currency?: "SOL" | "USDC";
  limit?: number;
  offset?: number;
}

export async function listOpenBounties(
  filter: ListBountiesFilter = {},
): Promise<TaskRecord[]> {
  let q = getDb()
    .selectFrom("tasks")
    .selectAll()
    .where("mode", "=", "bounty")
    .where("status", "=", "created")
    .orderBy("created_at", "desc");

  if (filter.currency) q = q.where("currency", "=", filter.currency);
  if (filter.limit) q = q.limit(filter.limit);
  if (filter.offset) q = q.offset(filter.offset);

  return q.execute();
}

export async function listSubmittedOlderThan(
  cutoff: Date,
): Promise<TaskRecord[]> {
  return getDb()
    .selectFrom("tasks")
    .selectAll()
    .where("status", "=", "submitted")
    .where("submitted_at", "<=", cutoff)
    .execute();
}

/**
 * Conditional status transition. Returns true iff a row was actually updated.
 * Used by the chain listener to gate webhook emission so replays don't double-emit.
 */
export async function transitionStatus(
  taskId: string,
  fromStatus: string | string[],
  toStatus: string,
  extra: { settled_at?: Date; submitted_at?: Date } = {},
): Promise<boolean> {
  const fromList = Array.isArray(fromStatus) ? fromStatus : [fromStatus];
  const result = await getDb()
    .updateTable("tasks")
    .set({ status: toStatus, ...extra })
    .where("task_id", "=", taskId)
    .where("status", "in", fromList)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

/**
 * Conditional assignment. Returns true iff the row transitioned from `created` to `assigned`.
 */
export async function transitionToAssigned(
  taskId: string,
  agentWallet: string,
): Promise<boolean> {
  const result = await getDb()
    .updateTable("tasks")
    .set({ assigned_agent: agentWallet, status: "assigned" })
    .where("task_id", "=", taskId)
    .where("status", "=", "created")
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

export async function listAssignedOrCreatedPastDeadline(
  now: Date,
): Promise<TaskRecord[]> {
  return getDb()
    .selectFrom("tasks")
    .selectAll()
    .where((eb) =>
      eb.or([eb("status", "=", "created"), eb("status", "=", "assigned")]),
    )
    .where("deadline", "<=", now)
    .execute();
}
