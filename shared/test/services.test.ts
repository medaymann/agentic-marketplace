import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { runner } from "node-pg-migrate";
import nacl from "tweetnacl";
import bs58 from "bs58";

import { destroyDb } from "../src/db/index";
import * as agentsDb from "../src/db/agents";
import * as tasksDb from "../src/db/tasks";
import * as deliverablesDb from "../src/db/deliverables";
import * as judgeVerdictsDb from "../src/db/judge-verdicts";
import * as sessionsDb from "../src/db/sessions";

// Services under test
import { preRegisterAgent, verifyWalletSignature } from "../src/services/agent";
import { applyToBounty } from "../src/services/bounty";
import { runJudge } from "../src/services/judge";
import { verifySIWS, verifyApiKey } from "../src/services/auth";
import * as noncesDb from "../src/db/nonces";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const databaseUrl = process.env["DATABASE_URL"];
const describeDb = databaseUrl ? describe : describe.skip;

const AGENT_WALLET = "Bddo2ek21cs8SmArWa7c3GTu8VQnAiKzs7fc1T3AF2hc";
const POSTER_WALLET = "DaAcmKvC3PLL4avmjLnfF2uNuYKaFjNYmmhRKYiXbqWV";

describeDb("services integration", () => {
  beforeAll(async () => {
    if (!databaseUrl) return;
    const pool = new pg.Pool({ connectionString: databaseUrl });
    try {
      await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
      await pool.query("CREATE SCHEMA public");
      await pool.query("GRANT ALL ON SCHEMA public TO public");
    } finally {
      await pool.end();
    }
    await runner({
      databaseUrl,
      dir: resolve(__dirname, "..", "migrations"),
      migrationsTable: "pgmigrations",
      direction: "up",
      count: Infinity,
      verbose: false,
    });
    // Seed a known agent wallet used across judge/task tests
    await agentsDb.insertPendingAgent({
      wallet: AGENT_WALLET,
      name: "fixture agent",
      description: "shared test fixture",
      capabilities: "test",
      capabilityTags: [],
      endpointUrl: "https://example.com/agent",
      maxResponseSeconds: 60,
      defaultMaxDeliverySeconds: 3600,
      supportedCurrencies: ["SOL"],
      minTaskRewardUsdc: 0n,
    });
  }, 60_000);

  afterAll(async () => {
    await destroyDb();
  });

  // ── agent service ──────────────────────────────────────────────────────────

  describe("preRegisterAgent", () => {
    it("creates agent row + session + returns nonce", async () => {
      const wallet = `${AGENT_WALLET.slice(0, 10)}${randomUUID().replace(/-/g, "").slice(0, 20)}`;

      // walletAddressSchema requires valid base58 32-byte key — use a real one
      const kp = nacl.sign.keyPair();
      const agentWallet = bs58.encode(kp.publicKey);

      const result = await preRegisterAgent({
        wallet: agentWallet,
        name: "test agent",
        description: "a test agent",
        capabilities: "testing",
        capabilityTags: ["test"],
        endpointUrl: "https://example.com/agent",
        maxResponseSeconds: 60,
        defaultMaxDeliverySeconds: 3_600,
        supportedCurrencies: ["SOL"],
        minTaskRewardUsdc: 0n,
      });

      expect(result.sessionToken).toMatch(/^reg_/);
      expect(result.nonce).toHaveLength(32);
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());

      const agent = await agentsDb.getAgentByWallet(agentWallet);
      expect(agent?.registration_stage).toBe("pending");
      expect(agent?.name).toBe("test agent");
    });

    it("verifyWalletSignature flips stage to wallet_verified", async () => {
      const kp = nacl.sign.keyPair();
      const agentWallet = bs58.encode(kp.publicKey);

      const { sessionToken, nonce } = await preRegisterAgent({
        wallet: agentWallet,
        name: "sig agent",
        description: "sig test",
        capabilities: "sig",
        capabilityTags: ["sig"],
        endpointUrl: "https://example.com/agent",
        maxResponseSeconds: 60,
        defaultMaxDeliverySeconds: 3_600,
        supportedCurrencies: ["SOL"],
        minTaskRewardUsdc: 0n,
      });

      const message = new TextEncoder().encode(`Sign in to Basira: ${nonce}`);
      const sigBytes = nacl.sign.detached(message, kp.secretKey);
      const signature = bs58.encode(sigBytes);

      await verifyWalletSignature({
        sessionToken,
        signature,
        publicKey: agentWallet,
      });

      const agent = await agentsDb.getAgentByWallet(agentWallet);
      expect(agent?.registration_stage).toBe("wallet_verified");
    });

    it("verifyWalletSignature rejects wrong signature", async () => {
      const kp = nacl.sign.keyPair();
      const agentWallet = bs58.encode(kp.publicKey);

      const { sessionToken } = await preRegisterAgent({
        wallet: agentWallet,
        name: "bad sig agent",
        description: "bad sig test",
        capabilities: "test",
        capabilityTags: [],
        endpointUrl: "https://example.com/agent",
        maxResponseSeconds: 60,
        defaultMaxDeliverySeconds: 3_600,
        supportedCurrencies: ["SOL"],
        minTaskRewardUsdc: 0n,
      });

      const wrongKp = nacl.sign.keyPair();
      const message = new TextEncoder().encode("wrong message");
      const badSig = bs58.encode(nacl.sign.detached(message, wrongKp.secretKey));

      await expect(
        verifyWalletSignature({ sessionToken, signature: badSig, publicKey: agentWallet }),
      ).rejects.toThrow("Signature verification failed");
    });
  });

  // ── bounty service ─────────────────────────────────────────────────────────

  describe("applyToBounty", () => {
    it("inserts application row", async () => {
      const kp = nacl.sign.keyPair();
      const agentWallet = bs58.encode(kp.publicKey);
      const taskId = randomUUID();

      await tasksDb.insertTask({
        taskId,
        posterWallet: POSTER_WALLET,
        posterKind: "human",
        assignedAgent: null,
        mode: "bounty",
        title: "test bounty",
        description: "test",
        acceptanceCriteria: ["passes"],
        currency: "SOL",
        amount: 10_000_000n,
        deadline: new Date(Date.now() + 3_600_000),
        status: "created",
      });

      // register the agent first so it exists
      await agentsDb.insertPendingAgent({
        wallet: agentWallet,
        name: "bounty agent",
        description: "test",
        capabilities: "test",
        capabilityTags: [],
        endpointUrl: "https://example.com",
        maxResponseSeconds: 60,
        defaultMaxDeliverySeconds: 3600,
        supportedCurrencies: ["SOL"],
        minTaskRewardUsdc: 0n,
      });

      await applyToBounty({ taskId, message: "I can do this" }, agentWallet);

      await expect(
        applyToBounty({ taskId, message: "duplicate" }, agentWallet),
      ).rejects.toThrow();
    });

    it("rejects application to non-bounty task", async () => {
      const taskId = randomUUID();
      await tasksDb.insertTask({
        taskId,
        posterWallet: POSTER_WALLET,
        posterKind: "human",
        assignedAgent: AGENT_WALLET,
        mode: "direct",
        title: "direct task",
        description: "direct",
        acceptanceCriteria: ["passes"],
        currency: "SOL",
        amount: 10_000_000n,
        deadline: new Date(Date.now() + 3_600_000),
        status: "assigned",
      });

      await expect(
        applyToBounty({ taskId, message: "apply" }, AGENT_WALLET),
      ).rejects.toThrow("not a bounty");
    });
  });

  // ── judge service ──────────────────────────────────────────────────────────

  describe("runJudge", () => {
    it("calls mock provider and persists verdict row with promptVersion", async () => {
      const taskId = randomUUID();
      await tasksDb.insertTask({
        taskId,
        posterWallet: POSTER_WALLET,
        posterKind: "human",
        assignedAgent: AGENT_WALLET,
        mode: "direct",
        title: "judge test",
        description: "judge me",
        acceptanceCriteria: ["compiles"],
        currency: "SOL",
        amount: 10_000_000n,
        deadline: new Date(Date.now() + 3_600_000),
        status: "submitted",
      });

      const deliverable = await deliverablesDb.insertPendingDeliverable({
        taskId,
        agentWallet: AGENT_WALLET,
        contentText: "PASS_ME the code compiles",
        fileUrls: [],
      });
      await deliverablesDb.confirmDeliverable(deliverable.id);

      const verdict = await runJudge(taskId);
      expect(verdict.verdict).toBe("pass");
      expect(verdict.promptVersion).toBe("judge-v1");

      const row = await judgeVerdictsDb.getLatestVerdictForTask(taskId);
      expect(row?.verdict).toBe("pass");
      expect(row?.prompt_version).toBe("judge-v1");
    });

    it("FAIL_ME deliverable → fail verdict persisted", async () => {
      const taskId = randomUUID();
      await tasksDb.insertTask({
        taskId,
        posterWallet: POSTER_WALLET,
        posterKind: "human",
        assignedAgent: AGENT_WALLET,
        mode: "direct",
        title: "fail test",
        description: "should fail",
        acceptanceCriteria: ["does thing"],
        currency: "SOL",
        amount: 10_000_000n,
        deadline: new Date(Date.now() + 3_600_000),
        status: "submitted",
      });

      const d = await deliverablesDb.insertPendingDeliverable({
        taskId,
        agentWallet: AGENT_WALLET,
        contentText: "FAIL_ME nothing works",
        fileUrls: [],
      });
      await deliverablesDb.confirmDeliverable(d.id);

      const verdict = await runJudge(taskId);
      expect(verdict.verdict).toBe("fail");
      expect(verdict.failedCriteria).toEqual(["does thing"]);

      const row = await judgeVerdictsDb.getLatestVerdictForTask(taskId);
      expect(row?.verdict).toBe("fail");
    });
  });

  // ── auth service ───────────────────────────────────────────────────────────

  describe("verifySIWS", () => {
    it("consumes nonce and issues session token", async () => {
      const kp = nacl.sign.keyPair();
      const wallet = bs58.encode(kp.publicKey);
      const nonce = `nonce_${randomUUID()}`;

      const issuedAt = new Date();
      const expiresAt = new Date(Date.now() + 600_000);
      const message = [
        "basira.xyz wants you to sign in with your Solana account:",
        wallet,
        "",
        "Sign in to Basira",
        "",
        `Nonce: ${nonce}`,
        `Issued At: ${issuedAt.toISOString()}`,
        `Expiration Time: ${expiresAt.toISOString()}`,
      ].join("\n");

      const msgBytes = new TextEncoder().encode(message);
      const sig = bs58.encode(nacl.sign.detached(msgBytes, kp.secretKey));

      const result = await verifySIWS({ message, signature: sig, publicKey: wallet });
      expect(result.sessionToken).toMatch(/^siws_/);
      expect(result.wallet).toBe(wallet);

      // Replay must fail — nonce consumed
      await expect(
        verifySIWS({ message, signature: sig, publicKey: wallet }),
      ).rejects.toThrow("Nonce already used");
    });
  });

  describe("verifyApiKey", () => {
    it("returns wallet for valid key, throws for unknown", async () => {
      const kp = nacl.sign.keyPair();
      const wallet = bs58.encode(kp.publicKey);

      // Pre-register and complete registration to get a real API key
      const { sessionToken } = await preRegisterAgent({
        wallet,
        name: "api key agent",
        description: "test",
        capabilities: "test",
        capabilityTags: [],
        endpointUrl: "https://example.com/agent",
        maxResponseSeconds: 60,
        defaultMaxDeliverySeconds: 3600,
        supportedCurrencies: ["SOL"],
        minTaskRewardUsdc: 0n,
      });

      const { completeRegistration } = await import("../src/services/agent.js");
      const { apiKey } = await completeRegistration({
        sessionToken,
        signedRegisterAgentTxBase64: "placeholder",
      });

      const result = await verifyApiKey(`Bearer ${apiKey}`);
      expect(result.wallet).toBe(wallet);

      await expect(verifyApiKey("Bearer bsr_invalid_key")).rejects.toThrow("Invalid API key");
    });
  });
});
