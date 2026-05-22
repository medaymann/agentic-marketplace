import { sql, type Selectable } from "kysely";
import { getDb } from "./kysely";
import type { DeliverablesTable } from "./types";
import type { DeliverableFile, ExternalLink } from "../storage/types";

// jsonb columns must receive serialized JSON, not a raw JS array/object —
// node-pg otherwise encodes an array as a Postgres array literal, which the
// jsonb type rejects with "invalid input syntax for type json". Cast to the
// column's insert type so Kysely accepts the raw SQL expression.
function toJsonb<T>(value: unknown): T {
  return sql`${JSON.stringify(value)}::jsonb` as unknown as T;
}

export type DeliverableRecord = Selectable<DeliverablesTable>;

export async function insertPendingDeliverable(input: {
  taskId: string;
  agentWallet: string;
  contentText: string;
  fileUrls: string[];
  files?: DeliverableFile[];
  externalLinks?: ExternalLink[];
}): Promise<DeliverableRecord> {
  return getDb()
    .insertInto("deliverables")
    .values({
      task_id: input.taskId,
      agent_wallet: input.agentWallet,
      content_text: input.contentText,
      file_urls: input.fileUrls,
      files: toJsonb<unknown[]>(input.files ?? []),
      external_links: toJsonb<unknown[]>(input.externalLinks ?? []),
      status: "pending",
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function confirmDeliverable(id: string): Promise<void> {
  await getDb()
    .updateTable("deliverables")
    .set({ status: "confirmed" })
    .where("id", "=", id)
    .execute();
}

/**
 * Confirms the latest pending deliverable for a task. Used by the chain listener
 * after submit_deliverable confirms on-chain. Returns true iff a row was updated.
 */
export async function confirmLatestForTask(taskId: string): Promise<boolean> {
  const result = await getDb()
    .updateTable("deliverables")
    .set({ status: "confirmed" })
    .where("task_id", "=", taskId)
    .where("status", "=", "pending")
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

export async function getLatestForTask(
  taskId: string,
): Promise<DeliverableRecord | undefined> {
  return getDb()
    .selectFrom("deliverables")
    .selectAll()
    .where("task_id", "=", taskId)
    .orderBy("submitted_at", "desc")
    .limit(1)
    .executeTakeFirst();
}
