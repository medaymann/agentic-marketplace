import { PublicKey } from "@solana/web3.js";
import type { VersionedTransaction } from "@solana/web3.js";
import * as deliverablesDb from "../db/deliverables";
import * as tasksDb from "../db/tasks";
import {
  deliverableSubmitInputSchema,
  presignedUploadRequestSchema,
} from "../schemas/deliverable";
import {
  getPresignedUploadUrl as storagePresignedUrl,
  getPresignedDownloadUrl,
} from "../storage/presigned";
import { fetchObjectBytes } from "../storage/fetch";
import { getPublicBase } from "../storage/client";
import { getConnection } from "../solana/connection";
import { getProgram } from "../solana/program";
import { buildSubmitDeliverableTx } from "../solana/builders/index";
import type {
  PresignedUpload,
  PresignedDownload,
  DeliverableFile,
} from "../storage/types";

export async function getDeliverableUploadUrl(
  rawInput: unknown,
  agentWallet: string,
): Promise<PresignedUpload> {
  const input = presignedUploadRequestSchema.parse(rawInput);

  const task = await tasksDb.getTaskById(input.taskId);
  if (!task) throw new Error(`Task not found: ${input.taskId}`);
  if (task.assigned_agent !== agentWallet) throw new Error("Not the assigned agent");

  return storagePresignedUrl(input);
}

/**
 * Returns a short-lived presigned GET URL for one file on a deliverable.
 * Callable by the task's poster or its assigned agent; everyone else gets
 * a thrown error which the API layer surfaces as 403.
 */
export async function getDeliverableDownloadUrl(input: {
  taskId: string;
  key: string;
  requesterWallet: string;
}): Promise<PresignedDownload> {
  const task = await tasksDb.getTaskById(input.taskId);
  if (!task) throw new Error(`Task not found: ${input.taskId}`);
  if (
    input.requesterWallet !== task.poster_wallet &&
    input.requesterWallet !== task.assigned_agent
  ) {
    throw new Error("Not the poster or assigned agent");
  }

  const deliverable = await deliverablesDb.getLatestForTask(input.taskId);
  if (!deliverable) throw new Error("No deliverable for this task");

  const files = (deliverable.files ?? []) as DeliverableFile[];
  const match = files.find((f) => f.key === input.key);
  if (!match) throw new Error("File not part of this deliverable");

  return getPresignedDownloadUrl(input.key);
}

export interface SubmitDeliverableResult {
  unsignedTx: VersionedTransaction;
  deliverableId: string;
}

export async function submitDeliverable(
  rawInput: unknown,
  agentWallet: string,
  recentBlockhash: string,
): Promise<SubmitDeliverableResult> {
  const input = deliverableSubmitInputSchema.parse(rawInput);

  const task = await tasksDb.getTaskById(input.taskId);
  if (!task) throw new Error(`Task not found: ${input.taskId}`);
  if (task.assigned_agent !== agentWallet) throw new Error("Not the assigned agent");
  if (task.status !== "assigned") throw new Error(`Task is not in assigned status: ${task.status}`);

  // Off-chain deadline check — fast feedback before tx build
  if (new Date() > task.deadline) {
    throw new Error("Task deadline has passed");
  }

  // Hash-verify every uploaded file against R2 before any tx build or DB write.
  // - Confirms each key actually exists at the address the agent claims.
  // - Confirms the bytes the agent hashed locally match what's stored.
  // - Confirms the key belongs to *this* task's namespace.
  // Skipped in mock mode (fetchObjectBytes returns null) so verify scripts
  // and local tests don't need a real R2 bucket.
  const keyPrefix = `tasks/${input.taskId}/`;
  const verifiedFiles: DeliverableFile[] = [];
  for (const file of input.files) {
    if (!file.key.startsWith(keyPrefix)) {
      throw new Error(`File key not under this task's namespace: ${file.key}`);
    }
    const fetched = await fetchObjectBytes(file.key);
    if (fetched && fetched.sha256 !== file.sha256) {
      throw new Error(`Hash mismatch for file ${file.name}`);
    }
    verifiedFiles.push({
      key: file.key,
      name: file.name,
      contentType: file.contentType,
      sizeBytes: file.sizeBytes,
      sha256: file.sha256,
      finalUrl: `${getPublicBase()}/${file.key}`,
    });
  }

  const mirroredFileUrls = [
    ...verifiedFiles.map((f) => f.finalUrl),
    ...input.fileUrls,
  ];

  const agent = new PublicKey(agentWallet);
  const connection = getConnection();
  const program = getProgram(connection);

  const { tx } = await buildSubmitDeliverableTx({
    taskIdUuid: input.taskId,
    agent,
    payer: agent,
    recentBlockhash,
    program,
  });

  const deliverable = await deliverablesDb.insertPendingDeliverable({
    taskId: input.taskId,
    agentWallet,
    contentText: input.contentText,
    fileUrls: mirroredFileUrls,
    files: verifiedFiles,
    externalLinks: input.externalLinks,
  });

  await deliverablesDb.confirmDeliverable(deliverable.id);
  await tasksDb.transitionStatus(input.taskId, "assigned", "submitted", {
    submitted_at: new Date(),
  });

  return { unsignedTx: tx, deliverableId: deliverable.id };
}
