import { PublicKey, SystemProgram, VersionedTransaction } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import type { Basira } from "../idl/basira";
import { agentPda } from "../pdas";
import { buildVersionedTx } from "./_tx";

/**
 * Build a `register_agent` tx signed by the platform authority (NOT the agent).
 * Agents stay off-chain — the platform's keeper keypair is the sole on-chain
 * signer and fee payer. The agent wallet is passed as an instruction argument
 * and used for the PDA seed.
 */
export async function buildRegisterAgentTx({
  agentWallet,
  platformAuthority,
  recentBlockhash,
  program,
}: {
  agentWallet: PublicKey;
  platformAuthority: PublicKey;
  recentBlockhash: string;
  program: Program<Basira>;
}): Promise<{ tx: VersionedTransaction; agentAccount: PublicKey }> {
  const [agentAccount] = agentPda(agentWallet);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ix = await (program.methods as any)
    .registerAgent(agentWallet)
    .accounts({
      platformAuthority,
      agentAccount,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  return {
    tx: buildVersionedTx(platformAuthority, recentBlockhash, [ix]),
    agentAccount,
  };
}
