import { randomUUID } from "node:crypto";
import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";
import * as agentsDb from "../db/agents";
import * as sessionsDb from "../db/sessions";
import { agentPreRegisterInputSchema } from "../schemas/agent";
import { verifyEd25519Signature } from "../solana/sig";
import { getConnection, confirmSignatureByPolling } from "../solana/connection";
import { getProgram } from "../solana/program";
import { agentPda } from "../solana/pdas";
import { buildRegisterAgentTx } from "../solana/builders/index";
import { loadPlatformAuthorityKeypair } from "../solana/keys";

const BCRYPT_ROUNDS = 10;
const REGISTRATION_SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface RegisterAgentOnChainResult {
  alreadyRegistered: boolean;
  agentAccount: string;
  txSignature: string | null;
}

/**
 * Create the agent's on-chain `AgentAccount` PDA, signed and paid for by the
 * platform authority (the keeper). Agents stay off-chain — they never sign or
 * pay for this. Without this PDA, any instruction that touches `agent_account`
 * (assign_agent, approve_sol, approve_usdc) fails with AccountNotInitialized.
 *
 * Idempotent: if the PDA already exists on-chain, returns early without sending
 * a tx (so re-onboarding the same wallet is safe).
 *
 * Unlike submit_deliverable, this DOES wait for confirmation. Registration is a
 * one-time prerequisite for assignment and payment, and there is no daemon-side
 * retry — so the caller must know it landed. A confirmation failure throws,
 * letting the onboarding route surface a retryable error to the user.
 */
export async function registerAgentOnChain(
  agentWallet: string,
): Promise<RegisterAgentOnChainResult> {
  const walletPk = new PublicKey(agentWallet);
  const [agentAccount] = agentPda(walletPk);
  const connection = getConnection();

  const existing = await connection.getAccountInfo(agentAccount);
  if (existing) {
    return { alreadyRegistered: true, agentAccount: agentAccount.toBase58(), txSignature: null };
  }

  const platformAuthority = loadPlatformAuthorityKeypair();
  const program = getProgram(connection);
  const { blockhash } = await connection.getLatestBlockhash("confirmed");

  const { tx } = await buildRegisterAgentTx({
    agentWallet: walletPk,
    platformAuthority: platformAuthority.publicKey,
    recentBlockhash: blockhash,
    program,
  });
  tx.sign([platformAuthority]);

  const txSignature = await connection.sendTransaction(tx, {
    skipPreflight: false,
    maxRetries: 3,
  });
  // Poll over HTTP RPC rather than confirmTransaction's WebSocket subscription,
  // which throws `bufferUtil.mask is not a function` on Node builds lacking a
  // working `bufferutil` native addon (e.g. Node 24).
  await confirmSignatureByPolling(txSignature);

  return { alreadyRegistered: false, agentAccount: agentAccount.toBase58(), txSignature };
}

export interface PreRegisterResult {
  sessionToken: string;
  nonce: string;
  expiresAt: Date;
}

export async function preRegisterAgent(
  rawInput: unknown,
): Promise<PreRegisterResult> {
  const input = agentPreRegisterInputSchema.parse(rawInput);

  await agentsDb.insertPendingAgent({
    wallet: input.wallet,
    name: input.name,
    description: input.description,
    capabilities: input.capabilities,
    capabilityTags: input.capabilityTags,
    endpointUrl: input.endpointUrl,
    maxResponseSeconds: input.maxResponseSeconds,
    defaultMaxDeliverySeconds: input.defaultMaxDeliverySeconds,
    supportedCurrencies: input.supportedCurrencies,
    minTaskRewardUsdc: input.minTaskRewardUsdc,
  });

  const sessionToken = `reg_${randomUUID()}`;
  const nonce = randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + REGISTRATION_SESSION_TTL_MS);

  await sessionsDb.issueSession({
    token: sessionToken,
    kind: "registration",
    wallet: input.wallet,
    data: { stage: "pending_signature", nonce, agentWallet: input.wallet },
    expiresAt,
  });

  return { sessionToken, nonce, expiresAt };
}

export async function verifyWalletSignature(input: {
  sessionToken: string;
  signature: string;
  publicKey: string;
}): Promise<void> {
  const session = await sessionsDb.getSession(input.sessionToken);
  if (!session) throw new Error("Session not found or expired");
  if (session.kind !== "registration") throw new Error("Invalid session kind");

  const data = session.data as Record<string, unknown>;
  const nonce = data["nonce"] as string | undefined;
  if (!nonce) throw new Error("Nonce not found in session");

  const message = new TextEncoder().encode(`Sign in to Basira: ${nonce}`);
  const signatureBytes = bs58.decode(input.signature);
  const pubkeyBytes = bs58.decode(input.publicKey);

  if (!verifyEd25519Signature(message, signatureBytes, pubkeyBytes)) {
    throw new Error("Signature verification failed");
  }

  await agentsDb.setRegistrationStage(input.publicKey, "wallet_verified");
  await sessionsDb.patchSessionData(input.sessionToken, {
    ...data,
    stage: "wallet_verified",
  });
}

export async function runHealthCheck(
  sessionToken: string,
): Promise<void> {
  const session = await sessionsDb.getSession(sessionToken);
  if (!session) throw new Error("Session not found or expired");

  const wallet = session.wallet;
  if (!wallet) throw new Error("No wallet associated with session");

  const agent = await agentsDb.getAgentByWallet(wallet);
  if (!agent) throw new Error("Agent not found");

  // Attempt a HEAD request to the agent's endpoint URL
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    await fetch(`${agent.endpoint_url}/health`, {
      method: "HEAD",
      signal: controller.signal,
    });
  } catch {
    // Health check failure is non-fatal during registration — log and continue
    console.warn(`Health check failed for ${wallet}`);
  } finally {
    clearTimeout(timer);
  }

  await agentsDb.recordHealthCheck(wallet, new Date());
  await agentsDb.setRegistrationStage(wallet, "endpoint_verified");

  const data = session.data as Record<string, unknown>;
  await sessionsDb.patchSessionData(sessionToken, {
    ...data,
    stage: "endpoint_verified",
  });
}

export interface CompleteRegistrationResult {
  apiKey: string;
  webhookSecret: string;
}

export async function completeRegistration(input: {
  sessionToken: string;
}): Promise<CompleteRegistrationResult> {
  const session = await sessionsDb.getSession(input.sessionToken);
  if (!session) throw new Error("Session not found or expired");
  if (session.kind !== "registration") throw new Error("Invalid session kind");

  const wallet = session.wallet;
  if (!wallet) throw new Error("No wallet associated with session");

  const apiKey = `bsr_${randomBytes(32).toString("hex")}`;
  const webhookSecret = randomBytes(32).toString("hex");
  const apiKeyHash = await bcrypt.hash(apiKey, BCRYPT_ROUNDS);

  await agentsDb.setApiKeyHash(wallet, apiKeyHash, webhookSecret);
  await sessionsDb.deleteSession(input.sessionToken);

  return { apiKey, webhookSecret };
}

export interface RotateApiKeyResult {
  apiKey: string;
}

export async function rotateApiKey(input: {
  wallet: string;
  message: string;
  signature: string;
}): Promise<RotateApiKeyResult> {
  const signatureBytes = bs58.decode(input.signature);
  const pubkeyBytes = bs58.decode(input.wallet);
  const messageBytes = new TextEncoder().encode(input.message);

  if (!verifyEd25519Signature(messageBytes, signatureBytes, pubkeyBytes)) {
    throw new Error("Signature verification failed");
  }

  const apiKey = `bsr_${randomBytes(32).toString("hex")}`;
  const apiKeyHash = await bcrypt.hash(apiKey, BCRYPT_ROUNDS);
  await agentsDb.rotateApiKeyHash(input.wallet, apiKeyHash);

  return { apiKey };
}
