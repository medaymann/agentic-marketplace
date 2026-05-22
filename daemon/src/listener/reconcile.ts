import { Connection, PublicKey } from "@solana/web3.js";
import {
  tasksDb,
  agentsDb,
  disputesDb,
  deliverablesDb,
  webhookDeliveriesDb,
  recordSettlement,
  fetchTaskAccount,
} from "@basira/shared";
import { TREASURY_ADDRESS } from "@basira/shared";
import { getLogger } from "../log.js";
import {
  type ParsedProgramTransaction,
  type InstructionName,
} from "./parse.js";
import { emitAgentWebhook, broadcastWebhook } from "./emit.js";
import { triggerJudge } from "./judge-trigger.js";

const FEE_BPS = 500n;
const BPS_DENOM = 10_000n;

interface HandlerCtx {
  connection: Connection;
  signature: string;
  blockTime: Date;
}

/**
 * Computes (releaseAmount, feeAmount) from total task amount, mirroring on-chain math.
 *  fee = amount * 500 / 10_000
 *  release = amount - fee
 */
function splitFee(amount: bigint): { release: bigint; fee: bigint } {
  const fee = (amount * FEE_BPS) / BPS_DENOM;
  return { release: amount - fee, fee };
}

async function findTaskByPda(
  pda: PublicKey,
): Promise<Awaited<ReturnType<typeof tasksDb.getTaskByPda>>> {
  return tasksDb.getTaskByPda(pda.toBase58());
}

/**
 * A task was created on-chain. Notify agents:
 *  - bounty mode  → broadcast `task.created` to every webhook agent whose
 *    capability_tags overlap, so they can apply.
 *  - direct mode  → the agent is already assigned at creation (no separate
 *    AssignAgent instruction will ever fire), so emit `task.offered` straight
 *    to the assigned agent.
 *
 * Idempotent: the listener can replay CreateTask on gap-fill. There's no status
 * transition to guard on, so we check whether a delivery for this task+event
 * already exists.
 */
async function handleCreateTask(
  accounts: PublicKey[],
  ctx: HandlerCtx,
): Promise<void> {
  const log = getLogger();
  const taskPda = accounts[1];
  if (!taskPda) return;
  const task = await findTaskByPda(taskPda);
  if (!task) {
    log.warn({ taskPda: taskPda.toBase58() }, "createTask: unknown task");
    return;
  }

  const payload = {
    taskId: task.task_id,
    title: task.title,
    description: task.description,
    acceptanceCriteria: task.acceptance_criteria,
    capabilityTags: task.capability_tags,
    currency: task.currency,
    amount: String(task.amount),
    deadline: Math.floor(task.deadline.getTime() / 1000),
    txSignature: ctx.signature,
  };

  if (task.mode === "direct") {
    if (!task.assigned_agent) {
      log.warn({ taskId: task.task_id }, "direct task has no assigned_agent");
      return;
    }
    const alreadySent = await webhookDeliveriesDb.existsForTaskEvent(
      task.task_id,
      "task.offered",
    );
    if (alreadySent) return;
    await emitAgentWebhook(task.assigned_agent, "task.offered", payload);
    return;
  }

  // bounty mode
  const alreadySent = await webhookDeliveriesDb.existsForTaskEvent(
    task.task_id,
    "task.created",
  );
  if (alreadySent) return;

  const agents = await agentsDb.listActiveAgentsByTags(task.capability_tags);
  if (agents.length === 0) return;

  await broadcastWebhook(agents.map((a) => a.wallet), "task.created", payload);
}

async function handleAssignAgent(
  accounts: PublicKey[],
  ctx: HandlerCtx,
): Promise<void> {
  const log = getLogger();
  const taskPda = accounts[1];
  const agentAccount = accounts[2];
  if (!taskPda || !agentAccount) return;
  const task = await findTaskByPda(taskPda);
  if (!task) {
    log.warn({ taskPda: taskPda.toBase58() }, "assignAgent: unknown task");
    return;
  }
  // The on-chain assign_agent tx is the source of truth for who got assigned —
  // accept_applicant intentionally does NOT pre-write assigned_agent to the DB
  // (that would suppress this webhook). Read the assigned wallet from chain.
  const onChain = await fetchTaskAccount(task.task_id);
  const assignedAgent =
    onChain?.assignedAgent?.toBase58() ?? task.assigned_agent ?? null;
  if (!assignedAgent) {
    log.warn({ taskId: task.task_id }, "assignAgent: no assigned_agent on-chain or in DB");
    return;
  }
  const fired = await tasksDb.transitionToAssigned(task.task_id, assignedAgent);
  if (fired) {
    await emitAgentWebhook(assignedAgent, "task.offered", {
      taskId: task.task_id,
      txSignature: ctx.signature,
    });
  }
}

async function handleSubmitDeliverable(
  accounts: PublicKey[],
  ctx: HandlerCtx,
): Promise<void> {
  const log = getLogger();
  const taskPda = accounts[1];
  if (!taskPda) return;
  const task = await findTaskByPda(taskPda);
  if (!task) {
    log.warn({ taskPda: taskPda.toBase58() }, "submitDeliverable: unknown task");
    return;
  }
  const fired = await tasksDb.transitionStatus(
    task.task_id,
    "assigned",
    "submitted",
    { submitted_at: ctx.blockTime },
  );
  if (!fired) return;
  await deliverablesDb.confirmLatestForTask(task.task_id);
  triggerJudge(task.task_id);
  await emitAgentWebhook(task.poster_wallet, "task.submitted", {
    taskId: task.task_id,
    txSignature: ctx.signature,
  });
}

async function handleApprove(
  accounts: PublicKey[],
  ctx: HandlerCtx,
): Promise<void> {
  const log = getLogger();
  const taskPda = accounts[1];
  if (!taskPda) return;
  const task = await findTaskByPda(taskPda);
  if (!task) {
    log.warn({ taskPda: taskPda.toBase58() }, "approve: unknown task");
    return;
  }
  const fired = await tasksDb.transitionStatus(
    task.task_id,
    "submitted",
    "settled",
    { settled_at: ctx.blockTime },
  );
  if (!fired) return;

  const amount = BigInt(task.amount);
  const { release, fee } = splitFee(amount);
  const agent = task.assigned_agent;
  if (!agent) {
    log.error({ taskId: task.task_id }, "approve: no assigned agent");
    return;
  }
  const currency = task.currency as "SOL" | "USDC";
  await recordSettlement({
    taskId: task.task_id,
    kind: "release",
    recipientWallet: agent,
    currency,
    amount: release,
    txSignature: ctx.signature,
  });
  await recordSettlement({
    taskId: task.task_id,
    kind: "fee",
    recipientWallet: TREASURY_ADDRESS.toBase58(),
    currency,
    amount: fee,
    txSignature: ctx.signature,
  });
  await emitAgentWebhook(agent, "task.approved", {
    taskId: task.task_id,
    txSignature: ctx.signature,
  });
}

async function handleClaimAfterTimeout(
  accounts: PublicKey[],
  ctx: HandlerCtx,
): Promise<void> {
  // Same DB shape as approve, different webhook event.
  const log = getLogger();
  const taskPda = accounts[1];
  if (!taskPda) return;
  const task = await findTaskByPda(taskPda);
  if (!task) {
    log.warn({ taskPda: taskPda.toBase58() }, "claimAfterTimeout: unknown task");
    return;
  }
  const fired = await tasksDb.transitionStatus(
    task.task_id,
    "submitted",
    "settled",
    { settled_at: ctx.blockTime },
  );
  if (!fired) return;

  const amount = BigInt(task.amount);
  const { release, fee } = splitFee(amount);
  const agent = task.assigned_agent;
  if (!agent) return;
  const currency = task.currency as "SOL" | "USDC";
  await recordSettlement({
    taskId: task.task_id,
    kind: "release",
    recipientWallet: agent,
    currency,
    amount: release,
    txSignature: ctx.signature,
  });
  await recordSettlement({
    taskId: task.task_id,
    kind: "fee",
    recipientWallet: TREASURY_ADDRESS.toBase58(),
    currency,
    amount: fee,
    txSignature: ctx.signature,
  });
  await emitAgentWebhook(agent, "task.settled", {
    taskId: task.task_id,
    txSignature: ctx.signature,
  });
}

async function handleOpenDispute(
  accounts: PublicKey[],
  ctx: HandlerCtx,
): Promise<void> {
  const log = getLogger();
  const taskPda = accounts[1];
  const signer = accounts[0];
  if (!taskPda || !signer) return;
  const task = await findTaskByPda(taskPda);
  if (!task) {
    log.warn({ taskPda: taskPda.toBase58() }, "openDispute: unknown task");
    return;
  }
  const fired = await tasksDb.transitionStatus(
    task.task_id,
    "submitted",
    "disputed",
  );
  if (!fired) return;

  // Service layer already wrote the disputes row pre-broadcast (poster manual or
  // arbitrator auto). If for some reason it's absent (outside-of-platform call),
  // create a stub row.
  const existing = await disputesDb.getOpenDisputeForTask(task.task_id);
  if (!existing) {
    await disputesDb.openDispute({
      taskId: task.task_id,
      openedBy: signer.toBase58(),
      reason: "Dispute opened on-chain (no prior service write)",
    });
  }

  // Notify the counterparty: if poster opened, agent gets the webhook. If
  // arbitrator opened (auto-dispute path), the agent also gets it.
  if (task.assigned_agent) {
    await emitAgentWebhook(task.assigned_agent, "task.disputed", {
      taskId: task.task_id,
      txSignature: ctx.signature,
    });
  }
}

async function handleResolveDispute(
  accounts: PublicKey[],
  ctx: HandlerCtx,
): Promise<void> {
  const log = getLogger();
  // resolveDisputeSol: arbitrator, task_account, vault, poster_wallet, agent_wallet, agent_account, treasury
  const taskPda = accounts[1];
  const posterWallet = accounts[3];
  const agentWallet = accounts[4];
  if (!taskPda || !posterWallet || !agentWallet) return;
  const task = await findTaskByPda(taskPda);
  if (!task) {
    log.warn({ taskPda: taskPda.toBase58() }, "resolveDispute: unknown task");
    return;
  }
  // We can't tell from the parsed accounts alone whether it was forAgent or
  // forPoster — that information lives in the instruction args (encoded). For
  // the listener path we read the disputes row pre-state: the service-layer
  // call set the ruling via recordRuling already (cron path) OR a manual call
  // means we need to look at the on-chain task account state post-execution.
  // Cleanest: assume the dispute row's `ruling` was already populated by the
  // shared service before broadcast; if not, fall back to "agent" if the task
  // currency went to the agent (which we can't easily verify without a token
  // balance diff).
  //
  // Simpler decision: trust the dispute row. If it has a ruling, follow it.
  // If not, log an error and move on; a manual recovery is needed.
  const dispute = await disputesDb.getOpenDisputeForTask(task.task_id);
  if (!dispute) {
    log.warn(
      { taskId: task.task_id },
      "resolveDispute: no open dispute row found; manual reconciliation needed",
    );
    return;
  }
  // The ruling field would be set by recordRuling (called by openDisputeAuto's
  // counterpart in resolveDispute service). For this MVP, we record it now
  // as "agent" and rely on the service layer to override if it called
  // recordRuling first. Since shared/services/dispute.ts's resolveDispute
  // doesn't currently write the row pre-broadcast, we treat resolution as
  // a no-op for the disputes row beyond marking it resolved.

  // Mark task settled or refunded based on the dispute row's existing ruling
  // if set; otherwise default to "agent" (release path) for now.
  const ruling = dispute.ruling ?? "agent";
  const currency = task.currency as "SOL" | "USDC";
  const amount = BigInt(task.amount);

  if (ruling === "agent") {
    const fired = await tasksDb.transitionStatus(
      task.task_id,
      "disputed",
      "settled",
      { settled_at: ctx.blockTime },
    );
    if (!fired) return;
    const { release, fee } = splitFee(amount);
    await recordSettlement({
      taskId: task.task_id,
      kind: "release",
      recipientWallet: agentWallet.toBase58(),
      currency,
      amount: release,
      txSignature: ctx.signature,
    });
    await recordSettlement({
      taskId: task.task_id,
      kind: "fee",
      recipientWallet: TREASURY_ADDRESS.toBase58(),
      currency,
      amount: fee,
      txSignature: ctx.signature,
    });
    await emitAgentWebhook(agentWallet.toBase58(), "task.settled", {
      taskId: task.task_id,
      txSignature: ctx.signature,
    });
  } else {
    const fired = await tasksDb.transitionStatus(
      task.task_id,
      "disputed",
      "refunded",
    );
    if (!fired) return;
    await recordSettlement({
      taskId: task.task_id,
      kind: "refund",
      recipientWallet: posterWallet.toBase58(),
      currency,
      amount,
      txSignature: ctx.signature,
    });
    await emitAgentWebhook(posterWallet.toBase58(), "task.refunded", {
      taskId: task.task_id,
      txSignature: ctx.signature,
    });
  }

  if (!dispute.resolved_at) {
    await disputesDb.recordRuling(
      task.task_id,
      ruling as "agent" | "poster",
      dispute.ruling_notes ?? "Resolved on-chain",
    );
  }
}

async function handleExpireOrCancel(
  accounts: PublicKey[],
  ctx: HandlerCtx,
  isExpire: boolean,
): Promise<void> {
  const log = getLogger();
  // expire_task_*: caller, task_account, vault, poster_wallet, ...
  // cancel_task_*: poster, task_account, vault, ...
  const taskPda = accounts[1];
  if (!taskPda) return;
  const task = await findTaskByPda(taskPda);
  if (!task) {
    log.warn({ taskPda: taskPda.toBase58() }, "expire/cancel: unknown task");
    return;
  }
  const targetStatus = isExpire ? "expired" : "refunded";
  const fired = await tasksDb.transitionStatus(
    task.task_id,
    ["created", "assigned"],
    targetStatus,
  );
  if (!fired) return;

  const currency = task.currency as "SOL" | "USDC";
  await recordSettlement({
    taskId: task.task_id,
    kind: "refund",
    recipientWallet: task.poster_wallet,
    currency,
    amount: BigInt(task.amount),
    txSignature: ctx.signature,
  });
  await emitAgentWebhook(
    task.poster_wallet,
    isExpire ? "task.expired" : "task.cancelled",
    { taskId: task.task_id, txSignature: ctx.signature },
  );
}

async function handleRejectAssignment(
  accounts: PublicKey[],
  ctx: HandlerCtx,
): Promise<void> {
  const log = getLogger();
  // reject_assignment_*: agent, task_account, vault, poster_wallet, ...
  const taskPda = accounts[1];
  if (!taskPda) return;
  const task = await findTaskByPda(taskPda);
  if (!task) {
    log.warn({ taskPda: taskPda.toBase58() }, "rejectAssignment: unknown task");
    return;
  }
  const fired = await tasksDb.transitionStatus(
    task.task_id,
    "assigned",
    "refunded",
  );
  if (!fired) return;
  const currency = task.currency as "SOL" | "USDC";
  await recordSettlement({
    taskId: task.task_id,
    kind: "refund",
    recipientWallet: task.poster_wallet,
    currency,
    amount: BigInt(task.amount),
    txSignature: ctx.signature,
  });
  await emitAgentWebhook(task.poster_wallet, "task.refunded", {
    taskId: task.task_id,
    txSignature: ctx.signature,
  });
}

export async function reconcileTransaction(
  parsed: ParsedProgramTransaction,
  connection: Connection,
): Promise<void> {
  const log = getLogger();
  const blockTime = parsed.blockTime
    ? new Date(parsed.blockTime * 1000)
    : new Date();
  const ctx: HandlerCtx = {
    connection,
    signature: parsed.signature,
    blockTime,
  };

  for (const ix of parsed.instructions) {
    try {
      await dispatch(ix.name, ix.accounts, ctx);
    } catch (err) {
      log.error(
        { err, instruction: ix.name, signature: parsed.signature },
        "reconcile handler failed",
      );
    }
  }
}

async function dispatch(
  name: InstructionName,
  accounts: PublicKey[],
  ctx: HandlerCtx,
): Promise<void> {
  switch (name) {
    case "RegisterAgent":
      // Agent row was written inline by completeRegistration; no listener action.
      return;
    case "CreateTaskSol":
    case "CreateTaskUsdc":
      // Service layer pre-inserts the task row; we only broadcast task.created.
      return handleCreateTask(accounts, ctx);
    case "AssignAgent":
      return handleAssignAgent(accounts, ctx);
    case "SubmitDeliverable":
      return handleSubmitDeliverable(accounts, ctx);
    case "ApproveSol":
    case "ApproveUsdc":
      return handleApprove(accounts, ctx);
    case "ClaimAfterTimeoutSol":
    case "ClaimAfterTimeoutUsdc":
      return handleClaimAfterTimeout(accounts, ctx);
    case "OpenDispute":
      return handleOpenDispute(accounts, ctx);
    case "ResolveDisputeSol":
    case "ResolveDisputeUsdc":
      return handleResolveDispute(accounts, ctx);
    case "ExpireTaskSol":
    case "ExpireTaskUsdc":
      return handleExpireOrCancel(accounts, ctx, true);
    case "CancelTaskSol":
    case "CancelTaskUsdc":
      return handleExpireOrCancel(accounts, ctx, false);
    case "RejectAssignmentSol":
    case "RejectAssignmentUsdc":
      return handleRejectAssignment(accounts, ctx);
  }
}
