import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import bs58 from "bs58";
import { z } from "zod";
import { wrap } from "@/lib/handler";
import { serialize } from "@/lib/serialize";
import {
  agentsDb,
  registerAgentOnChain,
  sessionsDb,
  verifyEd25519Signature,
} from "@basira/shared";

const BCRYPT_ROUNDS = 10;

const BodySchema = z.object({
  sessionId: z.string().min(1),
  wallet: z.string().min(32).max(44),
  signature: z.string().min(1),
});

/**
 * POST /api/v1/agents/cli-issue-key
 *
 * Browser-facing. After the user signs the session message with their wallet,
 * the browser POSTs here. The endpoint:
 *   1. Loads the session and its stored agent fields + expected message
 *   2. Verifies the Ed25519 signature
 *   3. Inserts the agent row if it doesn't exist (idempotent for the wallet)
 *   4. Mints a fresh API key + webhook secret, stores the bcrypt hash
 *   5. Marks the session "used" so the message can't be replayed
 *   6. Returns { wallet, apiKey }
 */
export const POST = wrap(async (req: NextRequest) => {
  const result = BodySchema.safeParse(await req.json());
  if (!result.success) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "Invalid request body", details: result.error.issues } },
      { status: 400 },
    );
  }
  const { sessionId, wallet, signature } = result.data;

  const session = await sessionsDb.getSession(sessionId);
  if (!session) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Session not found or expired" } },
      { status: 404 },
    );
  }
  if (session.kind !== "cli_onboarding") {
    return NextResponse.json(
      { error: { code: "forbidden", message: "Wrong session kind" } },
      { status: 403 },
    );
  }

  const data = session.data as {
    nonce: string;
    message: string;
    callbackUrl: string | null;
    agent: {
      name: string;
      description: string;
      capabilities: string;
      capabilityTags: string[];
      endpointUrl: string;
      supportedCurrencies: ("SOL" | "USDC")[];
      inputSchema?: unknown;
    };
    status: string;
  };

  if (data.status !== "pending") {
    return NextResponse.json(
      { error: { code: "conflict", message: "Session already used" } },
      { status: 409 },
    );
  }

  const sigBytes = bs58.decode(signature);
  const pubBytes = bs58.decode(wallet);
  const msgBytes = new TextEncoder().encode(data.message);
  if (!verifyEd25519Signature(msgBytes, sigBytes, pubBytes)) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Signature verification failed" } },
      { status: 401 },
    );
  }

  // Insert the agent row if this wallet doesn't have one yet. If it does, we
  // just rotate the key for that wallet — same behaviour the CLI expects.
  const existing = await agentsDb.getAgentByWallet(wallet);
  if (!existing) {
    await agentsDb.insertPendingAgent({
      wallet,
      name: data.agent.name,
      description: data.agent.description,
      capabilities: data.agent.capabilities,
      capabilityTags: data.agent.capabilityTags,
      endpointUrl: data.agent.endpointUrl,
      maxResponseSeconds: 60,
      defaultMaxDeliverySeconds: 3600,
      supportedCurrencies: data.agent.supportedCurrencies,
      minTaskRewardUsdc: BigInt(0),
      inputSchema: data.agent.inputSchema ?? null,
    });
  }

  // Create the on-chain AgentAccount PDA, keeper-signed. Required before the
  // agent can be assigned or paid (assign_agent / approve_* read this PDA).
  // Idempotent (no-op when the PDA exists) and confirmed before returning —
  // there is no retry path downstream, so we surface a retryable error rather
  // than issuing a key for an unpayable agent. Re-running onboarding is safe.
  try {
    await registerAgentOnChain(wallet);
  } catch (err) {
    console.error(`On-chain register_agent failed for ${wallet}:`, err);
    return NextResponse.json(
      {
        error: {
          code: "onchain_register_failed",
          message:
            "On-chain agent registration failed. Please run onboarding again to retry.",
        },
      },
      { status: 502 },
    );
  }

  const apiKey = `bsr_${randomBytes(32).toString("hex")}`;
  const webhookSecret = randomBytes(32).toString("hex");
  const apiKeyHash = await bcrypt.hash(apiKey, BCRYPT_ROUNDS);
  await agentsDb.setApiKeyHash(wallet, apiKeyHash, webhookSecret);

  await sessionsDb.setSessionWallet(sessionId, wallet);
  await sessionsDb.patchSessionData(sessionId, { ...data, status: "used" });

  return NextResponse.json(serialize({ wallet, apiKey, webhookSecret }));
});
