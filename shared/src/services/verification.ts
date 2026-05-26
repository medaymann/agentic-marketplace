import { PublicKey } from "@solana/web3.js";
import type { VersionedTransaction } from "@solana/web3.js";
import * as tasksDb from "../db/tasks";
import * as disputesDb from "../db/disputes";
import { getConnection } from "../solana/connection";
import { getProgram } from "../solana/program";
import { buildApproveSolTx, buildApproveUsdcTx, buildOpenDisputeTx } from "../solana/builders/index";
import { USDC_MINT_DEVNET } from "../solana/constants";

function usdcMint(): PublicKey {
  return process.env["SOLANA_CLUSTER"] === "mainnet-beta"
    ? new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")
    : USDC_MINT_DEVNET;
}

export async function approveTask(
  taskId: string,
  posterWallet: string,
  recentBlockhash: string,
): Promise<{ unsignedTx: VersionedTransaction }> {
  const task = await tasksDb.getTaskById(taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  if (task.poster_wallet !== posterWallet) throw new Error("Not the task poster");
  if (task.status !== "submitted") throw new Error(`Task is not submitted: ${task.status}`);
  if (!task.assigned_agent) throw new Error("No assigned agent on task");

  const poster = new PublicKey(posterWallet);
  const agentWallet = new PublicKey(task.assigned_agent);
  const connection = getConnection();
  const program = getProgram(connection);

  const base = { taskIdUuid: taskId, poster, agentWallet, payer: poster, recentBlockhash, program };

  if (task.currency === "SOL") {
    const { tx } = await buildApproveSolTx(base);
    return { unsignedTx: tx };
  } else {
    const { tx } = await buildApproveUsdcTx({ ...base, usdcMint: usdcMint() });
    return { unsignedTx: tx };
  }
}

export async function disputeTask(
  input: { taskId: string; reason: string },
  posterWallet: string,
  recentBlockhash: string,
): Promise<{ unsignedTx: VersionedTransaction }> {
  const task = await tasksDb.getTaskById(input.taskId);
  if (!task) throw new Error(`Task not found: ${input.taskId}`);
  if (task.poster_wallet !== posterWallet) throw new Error("Not the task poster");
  if (task.status !== "submitted") throw new Error(`Task is not submitted: ${task.status}`);

  const signer = new PublicKey(posterWallet);
  const connection = getConnection();
  const program = getProgram(connection);

  const { tx } = await buildOpenDisputeTx({
    taskIdUuid: input.taskId,
    signer,
    payer: signer,
    recentBlockhash,
    program,
  });

  await disputesDb.openDispute({
    taskId: input.taskId,
    openedBy: posterWallet,
    reason: input.reason,
  });

  return { unsignedTx: tx };
}

export async function respondToDispute(
  input: { taskId: string; response: string; evidenceUrls: string[] },
  _agentWallet: string,
): Promise<void> {
  const dispute = await disputesDb.getOpenDisputeForTask(input.taskId);
  if (!dispute) throw new Error(`No open dispute for task: ${input.taskId}`);

  await disputesDb.recordAgentResponse(input.taskId, input.response, input.evidenceUrls);
}
