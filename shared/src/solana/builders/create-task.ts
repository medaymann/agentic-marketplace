import {
  PublicKey,
  SystemProgram,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Program } from "@coral-xyz/anchor";
import BN from "bn.js";
import type { Basira } from "../idl/basira";
import { taskPda, vaultPda, taskIdFromUuid } from "../pdas";
import { buildVersionedTx } from "./_tx";

interface CreateTaskBase {
  taskIdUuid: string;
  mode: "direct" | "bounty";
  amount: bigint;
  deadlineUnix: number;
  assignedAgent: PublicKey | null;
  poster: PublicKey;
  payer: PublicKey;
  recentBlockhash: string;
  program: Program<Basira>;
}

export async function buildCreateTaskSolTx({
  taskIdUuid,
  mode,
  amount,
  deadlineUnix,
  assignedAgent,
  poster,
  payer,
  recentBlockhash,
  program,
}: CreateTaskBase): Promise<{
  tx: VersionedTransaction;
  taskIdBytes: Uint8Array;
  taskAccount: PublicKey;
  vault: PublicKey;
}> {
  const taskIdBytes = taskIdFromUuid(taskIdUuid);
  const [taskAccount] = taskPda(taskIdBytes);
  const [vault] = vaultPda(taskIdBytes);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ix = await (program.methods as any)
    .createTaskSol(
      Array.from(taskIdBytes),
      mode === "direct" ? { direct: {} } : { bounty: {} },
      new BN(amount.toString()),
      new BN(deadlineUnix),
      assignedAgent ?? null,
    )
    .accounts({
      poster,
      taskAccount,
      vault,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  return { tx: buildVersionedTx(payer, recentBlockhash, [ix]), taskIdBytes, taskAccount, vault };
}

export async function buildCreateTaskUsdcTx({
  taskIdUuid,
  mode,
  amount,
  deadlineUnix,
  assignedAgent,
  poster,
  payer,
  recentBlockhash,
  program,
  usdcMint,
}: CreateTaskBase & { usdcMint: PublicKey }): Promise<{
  tx: VersionedTransaction;
  taskIdBytes: Uint8Array;
  taskAccount: PublicKey;
  vault: PublicKey;
  posterTokenAccount: PublicKey;
  vaultTokenAccount: PublicKey;
}> {
  const taskIdBytes = taskIdFromUuid(taskIdUuid);
  const [taskAccount] = taskPda(taskIdBytes);
  const [vault] = vaultPda(taskIdBytes);

  const posterTokenAccount = getAssociatedTokenAddressSync(usdcMint, poster);
  const vaultTokenAccount = getAssociatedTokenAddressSync(
    usdcMint,
    vault,
    true, // allow off-curve (PDA)
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ix = await (program.methods as any)
    .createTaskUsdc(
      Array.from(taskIdBytes),
      mode === "direct" ? { direct: {} } : { bounty: {} },
      new BN(amount.toString()),
      new BN(deadlineUnix),
      assignedAgent ?? null,
    )
    .accounts({
      poster,
      taskAccount,
      vault,
      usdcMint,
      posterTokenAccount,
      vaultTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  return {
    tx: buildVersionedTx(payer, recentBlockhash, [ix]),
    taskIdBytes,
    taskAccount,
    vault,
    posterTokenAccount,
    vaultTokenAccount,
  };
}
