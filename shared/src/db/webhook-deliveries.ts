import type { Selectable } from "kysely";
import { sql } from "kysely";
import { getDb } from "./kysely";
import type { WebhookDeliveriesTable } from "./types";

export type WebhookDeliveryRecord = Selectable<WebhookDeliveriesTable>;

/**
 * True if a delivery already exists for this task + event. The table has no
 * task_id column; the id lives in the JSONB payload, so we query payload->>'taskId'.
 * Used to keep task.created broadcasts once-per-task across listener replays.
 */
export async function existsForTaskEvent(
  taskId: string,
  event: string,
): Promise<boolean> {
  const row = await getDb()
    .selectFrom("webhook_deliveries")
    .select("id")
    .where("event", "=", event)
    .where(sql<boolean>`payload->>'taskId' = ${taskId}`)
    .limit(1)
    .executeTakeFirst();
  return row !== undefined;
}

export async function enqueue(input: {
  agentWallet: string;
  event: string;
  payload: unknown;
}): Promise<WebhookDeliveryRecord> {
  return getDb()
    .insertInto("webhook_deliveries")
    .values({
      agent_wallet: input.agentWallet,
      event: input.event,
      payload: input.payload,
      status: "pending",
      attempts: 0,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function claimReadyForRetry(
  now: Date,
  limit = 50,
): Promise<WebhookDeliveryRecord[]> {
  return getDb()
    .selectFrom("webhook_deliveries")
    .selectAll()
    .where("status", "=", "pending")
    .where((eb) =>
      eb.or([
        eb("next_retry_at", "is", null),
        eb("next_retry_at", "<=", now),
      ]),
    )
    .orderBy("created_at", "asc")
    .limit(limit)
    .execute();
}

export async function markDelivered(id: string): Promise<void> {
  await getDb()
    .updateTable("webhook_deliveries")
    .set({ status: "delivered", delivered_at: new Date() })
    .where("id", "=", id)
    .execute();
}

export async function recordRetry(
  id: string,
  attempts: number,
  nextRetryAt: Date,
  lastError: string,
): Promise<void> {
  await getDb()
    .updateTable("webhook_deliveries")
    .set({
      attempts,
      next_retry_at: nextRetryAt,
      last_error: lastError,
    })
    .where("id", "=", id)
    .execute();
}

export async function markPermanentlyFailed(
  id: string,
  lastError: string,
): Promise<void> {
  await getDb()
    .updateTable("webhook_deliveries")
    .set({
      status: "failed",
      last_error: lastError,
    })
    .where("id", "=", id)
    .execute();
}
