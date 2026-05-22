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
import { loadPlatformAuthorityKeypair } from "../solana/keys";
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
  deliverableId: string;
  txSignature: string;
  status: "submitted";
}

/**
 * Off-chain auth has already established that `agentWallet` is the calling
 * agent. We do the database side effects (insert + confirm deliverable,
 * transition task status), then build, sign, and broadcast the on-chain
 * submit_deliverable tx using the platform authority keypair. Agents no
 * longer touch any signing material.
 */
export async function submitDeliverable(
  rawInput: unknown,
  agentWallet: string,
): Promise<SubmitDeliverableResult> {
  const input = deliverableSubmitInputSchema.parse(rawInput);

  const task = await tasksDb.getTaskById(input.taskId);
  if (!task) throw new Error(`Task not found: ${input.taskId}`);
  if (task.assigned_agent !== agentWallet) throw new Error("Not the assigned agent");
  if (task.status !== "assigned") throw new Error(`Task is not in assigned status: ${task.status}`);

  // Off-chain deadline check — fast feedback before tx build.
  if (new Date() > task.deadline) {
    throw new Error("Task deadline has passed");
  }

  // Hash-verify every uploaded file against R2 before any tx build or DB write.
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

  // Persist the deliverable FIRST — before any slow on-chain work — so the
  // agent's content can never be lost to a tx timeout or client disconnect.
  // Inserted as "pending"; the chain listener confirms it once the on-chain
  // submit lands (via deliverablesDb.confirmLatestForTask).
  const deliverable = await deliverablesDb.insertPendingDeliverable({
    taskId: input.taskId,
    agentWallet,
    contentText: input.contentText,
    fileUrls: mirroredFileUrls,
    files: verifiedFiles,
    externalLinks: input.externalLinks,
  });

  // Build + sign + broadcast on the platform authority's behalf, with a fresh
  // blockhash. We do NOT block on confirmation — the daemon's chain listener
  // observes the tx, transitions the task to "submitted", confirms the
  // deliverable, and triggers the judge. Blocking here made the call take
  // 5+ minutes on a congested devnet and risked the client timing out.
  const platformAuthority = loadPlatformAuthorityKeypair();
  const connection = getConnection();
  const program = getProgram(connection);

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const { tx } = await buildSubmitDeliverableTx({
    taskIdUuid: input.taskId,
    platformAuthority: platformAuthority.publicKey,
    recentBlockhash: blockhash,
    program,
  });
  tx.sign([platformAuthority]);

  const txSignature = await connection.sendTransaction(tx, {
    skipPreflight: false,
    maxRetries: 3,
  });

  return { deliverableId: deliverable.id, txSignature, status: "submitted" };
}
