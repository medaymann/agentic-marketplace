import { PublicKey } from "@solana/web3.js";
import type BN from "bn.js";
import { getConnection } from "./connection";
import { getProgram } from "./program";
import { agentPda, taskPda, taskIdFromUuid } from "./pdas";

export interface AgentAccountData {
  wallet: PublicKey;
  registeredAt: bigint;
  completedCount: bigint;
  disputedCount: bigint;
  status: { active: Record<string, never> } | { inactive: Record<string, never> };
  bump: number;
}

export interface TaskAccountData {
  taskId: number[];
  posterWallet: PublicKey;
  assignedAgent: PublicKey | null;
  mode: { direct: Record<string, never> } | { bounty: Record<string, never> };
  status:
    | { created: Record<string, never> }
    | { assigned: Record<string, never> }
    | { submitted: Record<string, never> }
    | { approved: Record<string, never> }
    | { disputed: Record<string, never> }
    | { settled: Record<string, never> }
    | { refunded: Record<string, never> }
    | { expired: Record<string, never> };
  currency: { sol: Record<string, never> } | { usdc: Record<string, never> };
  amount: bigint;
  feeBps: number;
  deadline: bigint;
  submittedAt: bigint | null;
  createdAt: bigint;
  bump: number;
}

function bnToBigint(bn: BN): bigint {
  return BigInt(bn.toString());
}

export async function fetchAgentAccount(
  wallet: PublicKey,
): Promise<AgentAccountData | null> {
  const connection = getConnection();
  const program = getProgram(connection);
  const [pda] = agentPda(wallet);
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await (program.account as any)["agentAccount"].fetch(pda);
    return {
      wallet: raw.wallet as PublicKey,
      registeredAt: bnToBigint(raw.registeredAt as BN),
      completedCount: bnToBigint(raw.completedCount as BN),
      disputedCount: bnToBigint(raw.disputedCount as BN),
      status: raw.status as AgentAccountData["status"],
      bump: raw.bump as number,
    };
  } catch {
    return null;
  }
}

export async function fetchTaskAccount(
  taskIdUuid: string,
): Promise<TaskAccountData | null> {
  const connection = getConnection();
  const program = getProgram(connection);
  const taskIdBytes = taskIdFromUuid(taskIdUuid);
  const [pda] = taskPda(taskIdBytes);
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await (program.account as any)["taskAccount"].fetch(pda);
    return {
      taskId: Array.from(raw.taskId as number[]),
      posterWallet: raw.posterWallet as PublicKey,
      assignedAgent: raw.assignedAgent as PublicKey | null,
      mode: raw.mode as TaskAccountData["mode"],
      status: raw.status as TaskAccountData["status"],
      currency: raw.currency as TaskAccountData["currency"],
      amount: bnToBigint(raw.amount as BN),
      feeBps: raw.feeBps as number,
      deadline: bnToBigint(raw.deadline as BN),
      submittedAt: raw.submittedAt ? bnToBigint(raw.submittedAt as BN) : null,
      createdAt: bnToBigint(raw.createdAt as BN),
      bump: raw.bump as number,
    };
  } catch {
    return null;
  }
}
