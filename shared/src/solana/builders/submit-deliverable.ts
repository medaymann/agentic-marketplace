import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import type { Basira } from "../idl/basira";
import { taskPda, taskIdFromUuid } from "../pdas";
import { buildVersionedTx } from "./_tx";

/**
 * Build a `submit_deliverable` tx signed by the platform authority (NOT the
 * agent). Agents stay off-chain — the platform's daemon-side keypair is the
 * sole on-chain signer for submission marker.
 */
export async function buildSubmitDeliverableTx({
  taskIdUuid,
  platformAuthority,
  recentBlockhash,
  program,
}: {
  taskIdUuid: string;
  platformAuthority: PublicKey;
  recentBlockhash: string;
  program: Program<Basira>;
}): Promise<{ tx: VersionedTransaction }> {
  const taskIdBytes = taskIdFromUuid(taskIdUuid);
  const [taskAccount] = taskPda(taskIdBytes);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ix = await (program.methods as any)
    .submitDeliverable()
    .accounts({ platformAuthority, taskAccount })
    .instruction();

  // Platform authority pays the fee too — agents never pay tx fees.
  return { tx: buildVersionedTx(platformAuthority, recentBlockhash, [ix]) };
}
