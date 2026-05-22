import { PublicKey } from "@solana/web3.js";
import type { VersionedTransaction } from "@solana/web3.js";
import * as bountyApplicationsDb from "../db/bounty-applications";
import * as tasksDb from "../db/tasks";
import { getConnection } from "../solana/connection";
import { getProgram } from "../solana/program";
import { buildAssignAgentTx } from "../solana/builders/index";

export async function applyToBounty(
  input: { taskId: string; message: string },
  agentWallet: string,
): Promise<void> {
  const task = await tasksDb.getTaskById(input.taskId);
  if (!task) throw new Error(`Task not found: ${input.taskId}`);
  if (task.mode !== "bounty") throw new Error("Task is not a bounty");
  if (task.status !== "created") throw new Error(`Task is not open for applications: ${task.status}`);

  await bountyApplicationsDb.insertApplication({
    taskId: input.taskId,
    agentWallet,
    message: input.message,
  });
}

export async function acceptApplicant(
  input: { taskId: string; applicationId: string },
  posterWallet: string,
  recentBlockhash: string,
): Promise<{ unsignedTx: VersionedTransaction }> {
  const task = await tasksDb.getTaskById(input.taskId);
  if (!task) throw new Error(`Task not found: ${input.taskId}`);
  if (task.poster_wallet !== posterWallet) throw new Error("Not the task poster");
  if (task.status !== "created") throw new Error(`Task is not open: ${task.status}`);

  const applications = await bountyApplicationsDb.listApplicationsForTask(input.taskId);
  const application = applications.find((a) => a.id === input.applicationId);
  if (!application) throw new Error("Application not found");
  if (application.status !== "pending") throw new Error("Application is not pending");

  const poster = new PublicKey(posterWallet);
  const agentWallet = new PublicKey(application.agent_wallet);
  const connection = getConnection();
  const program = getProgram(connection);

  const { tx } = await buildAssignAgentTx({
    taskIdUuid: input.taskId,
    poster,
    agentWallet,
    payer: poster,
    recentBlockhash,
    program,
  });

  await bountyApplicationsDb.acceptApplication(input.applicationId);
  await bountyApplicationsDb.rejectAllPendingForTask(input.taskId, input.applicationId);
  // Do NOT transition the task to "assigned" here. The daemon owns that
  // transition when it observes the on-chain assign_agent tx — and it only
  // emits the task.offered webhook if the transition fires (status: created →
  // assigned). Pre-setting "assigned" here would suppress that webhook, so the
  // agent would never be told to start work. Mirrors the direct-task flow,
  // where the daemon likewise drives status + webhook from the chain event.

  return { unsignedTx: tx };
}

export async function rejectApplicants(
  input: { taskId: string; applicationIds: string[] },
  posterWallet: string,
): Promise<void> {
  const task = await tasksDb.getTaskById(input.taskId);
  if (!task) throw new Error(`Task not found: ${input.taskId}`);
  if (task.poster_wallet !== posterWallet) throw new Error("Not the task poster");

  for (const id of input.applicationIds) {
    await bountyApplicationsDb.rejectApplication(id);
  }
}
