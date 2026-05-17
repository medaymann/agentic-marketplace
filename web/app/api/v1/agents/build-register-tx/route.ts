import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { z } from "zod";
import { wrap } from "@/lib/handler";
import { serialize } from "@/lib/serialize";
import {
  agentPda,
  buildRegisterAgentTx,
  getConnection,
  getLatestBlockhashWithRetry,
  getProgram,
} from "@basira/shared";

const inputSchema = z.object({
  wallet: z.string().min(32).max(44),
});

export const POST = wrap(async (req: NextRequest) => {
  const parsed = inputSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: "Invalid input",
          details: parsed.error.issues,
        },
      },
      { status: 400 },
    );
  }

  let walletPk: PublicKey;
  try {
    walletPk = new PublicKey(parsed.data.wallet);
  } catch {
    return NextResponse.json(
      { error: { code: "validation_error", message: "Invalid wallet pubkey" } },
      { status: 400 },
    );
  }

  const connection = getConnection();
  const [agentAccount] = agentPda(walletPk);
  const existing = await connection.getAccountInfo(agentAccount);
  if (existing) {
    return NextResponse.json(
      serialize({
        alreadyRegistered: true,
        agentAccount,
      }),
    );
  }

  const balance = await connection.getBalance(walletPk);
  if (balance === 0) {
    return NextResponse.json(
      {
        error: {
          code: "insufficient_funds",
          message:
            "Wallet has 0 SOL. Fund the wallet on devnet before registering (faucet.solana.com).",
        },
      },
      { status: 400 },
    );
  }

  const blockhash = await getLatestBlockhashWithRetry();
  const program = getProgram(connection);
  const { tx } = await buildRegisterAgentTx({
    wallet: walletPk,
    payer: walletPk,
    recentBlockhash: blockhash,
    program,
  });

  return NextResponse.json(
    serialize({
      alreadyRegistered: false,
      agentAccount,
      unsignedTx: tx,
    }),
  );
});
