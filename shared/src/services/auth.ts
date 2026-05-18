import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import bs58 from "bs58";
import * as agentsDb from "../db/agents";
import * as sessionsDb from "../db/sessions";
import * as noncesDb from "../db/nonces";
import { verifyEd25519Signature, buildSiwsMessage } from "../solana/sig";

const SIWS_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface VerifySIWSResult {
  sessionToken: string;
  wallet: string;
  expiresAt: Date;
}

export async function verifySIWS(input: {
  message: string;
  signature: string;
  publicKey: string;
}): Promise<VerifySIWSResult> {
  const signatureBytes = bs58.decode(input.signature);
  const pubkeyBytes = bs58.decode(input.publicKey);
  const messageBytes = new TextEncoder().encode(input.message);

  if (!verifyEd25519Signature(messageBytes, signatureBytes, pubkeyBytes)) {
    throw new Error("Signature verification failed");
  }

  // Extract nonce from the message and consume it to prevent replay
  const nonceMatch = /^Nonce: (.+)$/m.exec(input.message);
  if (!nonceMatch?.[1]) throw new Error("Nonce not found in SIWS message");
  const nonce = nonceMatch[1];

  const consumed = await noncesDb.consumeNonce(nonce);
  if (!consumed) throw new Error("Nonce already used");

  const sessionToken = `siws_${randomUUID()}`;
  const expiresAt = new Date(Date.now() + SIWS_SESSION_TTL_MS);

  await sessionsDb.issueSession({
    token: sessionToken,
    kind: "siws",
    wallet: input.publicKey,
    data: { publicKey: input.publicKey },
    expiresAt,
  });

  return { sessionToken, wallet: input.publicKey, expiresAt };
}

export async function verifyApiKey(
  headerValue: string,
): Promise<{ wallet: string }> {
  // Expected format: "Bearer bsr_<hex>"
  const token = headerValue.startsWith("Bearer ")
    ? headerValue.slice(7)
    : headerValue;

  if (!token) throw new Error("Missing API key");

  const agents = await agentsDb.listActiveAgents();

  for (const agent of agents) {
    if (!agent.api_key_hash) continue;
    const match = await bcrypt.compare(token, agent.api_key_hash);
    if (match) return { wallet: agent.wallet };
  }

  throw new Error("Invalid API key");
}
