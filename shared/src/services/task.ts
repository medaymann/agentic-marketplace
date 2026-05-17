import { randomUUID } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { taskCreateInputSchema } from "../schemas/task";
import * as tasksDb from "../db/tasks";
import * as agentsDb from "../db/agents";
import { validateAgainstSchema } from "../domain/typed-inputs";
import { getConnection } from "../solana/connection";
import { getProgram } from "../solana/program";
import { taskIdFromUuid } from "../solana/pdas";
import {
  buildCreateTaskSolTx,
  buildCreateTaskUsdcTx,
  buildCancelTaskSolTx,
  buildCancelTaskUsdcTx,
} from "../solana/builders/index";
import { USDC_MINT_DEVNET } from "../solana/constants";
import type { VersionedTransaction } from "@solana/web3.js";

function usdcMint(): PublicKey {
  return process.env["SOLANA_CLUSTER"] === "mainnet-beta"
    ? new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")
    : USDC_MINT_DEVNET;
}

export interface CreateTaskResult {
  unsignedTx: VersionedTransaction;
  taskId: string;
  taskAccount: PublicKey;
  vault: PublicKey;
}

export async function createDirectTask(
  rawInput: unknown,
  posterWallet: string,
  recentBlockhash: string,
): Promise<CreateTaskResult> {
  const input = taskCreateInputSchema.parse(rawInput);
  if (input.mode !== "direct") throw new Error("Expected direct mode task");

  const agent = await agentsDb.getAgentByWallet(input.assignedAgent);
  if (!agent) throw new Error(`Assigned agent not registered: ${input.assignedAgent}`);

  // If the agent declared an input schema, the poster MUST supply matching
  // typed inputs. If the agent has no schema, typedInputs is ignored.
  let typedInputs: unknown | null = null;
  let inputSchemaSnapshot: unknown | null = null;
  if (agent.input_schema) {
    if (!input.typedInputs) {
      throw new Error(
        "Agent declares an input schema; typedInputs is required to assign a task",
      );
    }
    validateAgainstSchema(agent.input_schema, input.typedInputs);
    typedInputs = input.typedInputs;
    inputSchemaSnapshot = agent.input_schema;
  }

  const taskId = randomUUID();
  const poster = new PublicKey(posterWallet);
  const connection = getConnection();
  const program = getProgram(connection);

  const base = {
    taskIdUuid: taskId,
    mode: "direct" as const,
    amount: input.amount,
    deadlineUnix: Number(input.deadline),
    assignedAgent: new PublicKey(input.assignedAgent),
    poster,
    payer: poster,
    recentBlockhash,
    program,
  };

  let result: { tx: VersionedTransaction; taskAccount: PublicKey; vault: PublicKey };
  if (input.currency === "SOL") {
    const r = await buildCreateTaskSolTx(base);
    result = { tx: r.tx, taskAccount: r.taskAccount, vault: r.vault };
  } else {
    const r = await buildCreateTaskUsdcTx({ ...base, usdcMint: usdcMint() });
    result = { tx: r.tx, taskAccount: r.taskAccount, vault: r.vault };
  }

  await tasksDb.insertTask({
    taskId,
    posterWallet,
    posterKind: "human",
    assignedAgent: input.assignedAgent,
    mode: "direct",
    title: input.title,
    description: input.description,
    acceptanceCriteria: input.acceptanceCriteria,
    currency: input.currency,
    amount: input.amount,
    deadline: new Date(Number(input.deadline) * 1000),
    status: "assigned",
    taskPda: result.taskAccount.toBase58(),
    typedInputs,
    inputSchemaSnapshot,
  });

  return { unsignedTx: result.tx, taskId, taskAccount: result.taskAccount, vault: result.vault };
}

export async function createBountyTask(
  rawInput: unknown,
  posterWallet: string,
  recentBlockhash: string,
): Promise<CreateTaskResult> {
  const input = taskCreateInputSchema.parse(rawInput);
  if (input.mode !== "bounty") throw new Error("Expected bounty mode task");

  const taskId = randomUUID();
  const poster = new PublicKey(posterWallet);
  const connection = getConnection();
  const program = getProgram(connection);

  const base = {
    taskIdUuid: taskId,
    mode: "bounty" as const,
    amount: input.amount,
    deadlineUnix: Number(input.deadline),
    assignedAgent: null,
    poster,
    payer: poster,
    recentBlockhash,
    program,
  };

  let result: { tx: VersionedTransaction; taskAccount: PublicKey; vault: PublicKey };
  if (input.currency === "SOL") {
    const r = await buildCreateTaskSolTx(base);
    result = { tx: r.tx, taskAccount: r.taskAccount, vault: r.vault };
  } else {
    const r = await buildCreateTaskUsdcTx({ ...base, usdcMint: usdcMint() });
    result = { tx: r.tx, taskAccount: r.taskAccount, vault: r.vault };
  }

  await tasksDb.insertTask({
    taskId,
    posterWallet,
    posterKind: "human",
    assignedAgent: null,
    mode: "bounty",
    title: input.title,
    description: input.description,
    acceptanceCriteria: input.acceptanceCriteria,
    currency: input.currency,
    amount: input.amount,
    deadline: new Date(Number(input.deadline) * 1000),
    status: "created",
    taskPda: result.taskAccount.toBase58(),
  });

  return { unsignedTx: result.tx, taskId, taskAccount: result.taskAccount, vault: result.vault };
}

export async function cancelTask(
  taskId: string,
  posterWallet: string,
  recentBlockhash: string,
): Promise<{ unsignedTx: VersionedTransaction }> {
  const task = await tasksDb.getTaskById(taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  if (task.poster_wallet !== posterWallet) throw new Error("Not the task poster");
  if (!["created", "assigned"].includes(task.status)) {
    throw new Error(`Cannot cancel task in status: ${task.status}`);
  }

  const poster = new PublicKey(posterWallet);
  const connection = getConnection();
  const program = getProgram(connection);

  const base = { taskIdUuid: taskId, poster, payer: poster, recentBlockhash, program };

  if (task.currency === "SOL") {
    const { tx } = await buildCancelTaskSolTx(base);
    return { unsignedTx: tx };
  } else {
    const { tx } = await buildCancelTaskUsdcTx({ ...base, usdcMint: usdcMint() });
    return { unsignedTx: tx };
  }
}
