import type { Selectable } from "kysely";
import { getDb } from "./kysely";
import type { DeliverablesTable } from "./types";
import type { DeliverableFile, ExternalLink } from "../storage/types";

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
      files: input.files ?? [],
      external_links: input.externalLinks ?? [],
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
