import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { runner } from "node-pg-migrate";

import {
  agentsDb,
  bountyApplicationsDb,
  deliverablesDb,
  destroyDb,
  disputesDb,
  judgeVerdictsDb,
  noncesDb,
  sessionsDb,
  settlementsDb,
  tasksDb,
  webhookDeliveriesDb,
} from "../src/db/index";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const databaseUrl = process.env["DATABASE_URL"];

const VALID_WALLET = "DaAcmKvC3PLL4avmjLnfF2uNuYKaFjNYmmhRKYiXbqWV";
const AGENT_WALLET = "Bddo2ek21cs8SmArWa7c3GTu8VQnAiKzs7fc1T3AF2hc";
const KEEPER_WALLET = "5Gb5kQe83EEQoUgEWtLShUpidb1R589g6yC6V26ANhLR";
const VALID_TX_SIG =
  "2cx5davrzUCih2bpeKTmxNhm9WhQ52vGcCpXVm7xVd6m3EvBbxEt7q7xXvMbsDF1WgcgkcJSguVRGY7ZuHuUAyoj";

const describeDb = databaseUrl ? describe : describe.skip;

describeDb("db integration", () => {
  beforeAll(async () => {
    if (!databaseUrl) return;
    // Hard reset between runs.
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
  }, 60_000);

  afterAll(async () => {
    await destroyDb();
  });

  it("agents: insert pending → fetch by wallet round-trip", async () => {
    await agentsDb.insertPendingAgent({
      wallet: AGENT_WALLET,
      name: "demo",
      description: "echo agent",
      capabilities: "echo",
      capabilityTags: ["echo"],
      endpointUrl: "https://example.com/agent",
      maxResponseSeconds: 60,
      defaultMaxDeliverySeconds: 3_600,
      supportedCurrencies: ["SOL"],
      minTaskRewardUsdc: 0n,
    });
    const row = await agentsDb.getAgentByWallet(AGENT_WALLET);
    expect(row?.name).toBe("demo");
    expect(row?.registration_stage).toBe("pending");
    expect(row?.capability_tags).toEqual(["echo"]);
  });

  it("agents: setApiKeyHash flips registration_stage to complete", async () => {
    await agentsDb.setApiKeyHash(AGENT_WALLET, "hashed", "wh-secret");
    const row = await agentsDb.getAgentByWallet(AGENT_WALLET);
    expect(row?.registration_stage).toBe("complete");
    expect(row?.api_key_hash).toBe("hashed");
  });

  it("tasks: insert + getById round-trip preserves bigint amount", async () => {
    const taskId = randomUUID();
    await tasksDb.insertTask({
      taskId,
      posterWallet: VALID_WALLET,
      posterKind: "human",
      assignedAgent: AGENT_WALLET,
      mode: "direct",
      title: "build a thing",
      description: "build a small thing",
      acceptanceCriteria: ["compiles", "runs"],
      currency: "SOL",
      amount: 100_000_000n,
      deadline: new Date(Date.now() + 2 * 3_600_000),
      status: "assigned",
    });
    const row = await tasksDb.getTaskById(taskId);
    expect(row?.title).toBe("build a thing");
    expect(BigInt(row!.amount)).toBe(100_000_000n);
  });

  it("bounty_applications: UNIQUE (task_id, agent_wallet) blocks duplicates", async () => {
    const taskId = randomUUID();
    await tasksDb.insertTask({
      taskId,
      posterWallet: VALID_WALLET,
      posterKind: "human",
      assignedAgent: null,
      mode: "bounty",
      title: "x",
      description: "x",
      acceptanceCriteria: ["x"],
      currency: "USDC",
      amount: 1_000_000n,
      deadline: new Date(Date.now() + 7_200_000),
      status: "created",
    });
    await bountyApplicationsDb.insertApplication({
      taskId,
      agentWallet: AGENT_WALLET,
      message: "first",
    });
    await expect(
      bountyApplicationsDb.insertApplication({
        taskId,
        agentWallet: AGENT_WALLET,
        message: "second",
      }),
    ).rejects.toThrow();
  });

  it("deliverables: insert pending → confirm → getLatestForTask", async () => {
    const taskId = randomUUID();
    await tasksDb.insertTask({
      taskId,
      posterWallet: VALID_WALLET,
      posterKind: "human",
      assignedAgent: AGENT_WALLET,
      mode: "direct",
      title: "x",
      description: "x",
      acceptanceCriteria: ["x"],
      currency: "SOL",
      amount: 10_000_000n,
      deadline: new Date(Date.now() + 7_200_000),
      status: "assigned",
    });
    const d = await deliverablesDb.insertPendingDeliverable({
      taskId,
      agentWallet: AGENT_WALLET,
      contentText: "done",
      fileUrls: [],
    });
    await deliverablesDb.confirmDeliverable(d.id);
    const latest = await deliverablesDb.getLatestForTask(taskId);
    expect(latest?.status).toBe("confirmed");
    expect(latest?.content_text).toBe("done");
  });

  it("judge_verdicts: insert + getLatest", async () => {
    const taskId = randomUUID();
    await tasksDb.insertTask({
      taskId,
      posterWallet: VALID_WALLET,
      posterKind: "human",
      assignedAgent: AGENT_WALLET,
      mode: "direct",
      title: "x",
      description: "x",
      acceptanceCriteria: ["x"],
      currency: "SOL",
      amount: 10_000_000n,
      deadline: new Date(Date.now() + 7_200_000),
      status: "submitted",
    });
    await judgeVerdictsDb.insertVerdict({
      taskId,
      verdict: "pass",
      confidence: 0.9,
      reasoning: "looks good",
      failedCriteria: [],
      model: "mock",
      promptVersion: "judge-v1",
    });
    const latest = await judgeVerdictsDb.getLatestVerdictForTask(taskId);
    expect(latest?.verdict).toBe("pass");
    expect(latest?.prompt_version).toBe("judge-v1");
  });

  it("disputes: open → record response → resolve", async () => {
    const taskId = randomUUID();
    await tasksDb.insertTask({
      taskId,
      posterWallet: VALID_WALLET,
      posterKind: "human",
      assignedAgent: AGENT_WALLET,
      mode: "direct",
      title: "x",
      description: "x",
      acceptanceCriteria: ["x"],
      currency: "SOL",
      amount: 10_000_000n,
      deadline: new Date(Date.now() + 7_200_000),
      status: "disputed",
    });
    await disputesDb.openDispute({
      taskId,
      openedBy: VALID_WALLET,
      reason: "not what I wanted",
    });
    await disputesDb.recordAgentResponse(taskId, "I delivered as specified", []);
    await disputesDb.recordRuling(taskId, "agent", "criteria met");
    const open = await disputesDb.getOpenDisputeForTask(taskId);
    expect(open).toBeUndefined();
  });

  it("webhook_deliveries: enqueue → claim → markDelivered", async () => {
    const enq = await webhookDeliveriesDb.enqueue({
      agentWallet: AGENT_WALLET,
      event: "task.offered",
      payload: { taskId: "x" },
    });
    const ready = await webhookDeliveriesDb.claimReadyForRetry(new Date());
    expect(ready.find((r) => r.id === enq.id)).toBeDefined();
    await webhookDeliveriesDb.markDelivered(enq.id);
    const stillReady = await webhookDeliveriesDb.claimReadyForRetry(new Date());
    expect(stillReady.find((r) => r.id === enq.id)).toBeUndefined();
  });

  it("settlements: idempotent on duplicate (tx_signature, kind, recipient)", async () => {
    const taskId = randomUUID();
    await tasksDb.insertTask({
      taskId,
      posterWallet: VALID_WALLET,
      posterKind: "human",
      assignedAgent: AGENT_WALLET,
      mode: "direct",
      title: "x",
      description: "x",
      acceptanceCriteria: ["x"],
      currency: "SOL",
      amount: 10_000_000n,
      deadline: new Date(Date.now() + 7_200_000),
      status: "settled",
    });
    await settlementsDb.recordSettlement({
      taskId,
      kind: "release",
      recipientWallet: AGENT_WALLET,
      currency: "SOL",
      amount: 9_500_000n,
      txSignature: VALID_TX_SIG,
    });
    // Listener replay — same tuple, no-op:
    await settlementsDb.recordSettlement({
      taskId,
      kind: "release",
      recipientWallet: AGENT_WALLET,
      currency: "SOL",
      amount: 9_500_000n,
      txSignature: VALID_TX_SIG,
    });
    // Different kind on same tx — that's the fee row in real flows:
    await settlementsDb.recordSettlement({
      taskId,
      kind: "fee",
      recipientWallet: KEEPER_WALLET,
      currency: "SOL",
      amount: 500_000n,
      txSignature: VALID_TX_SIG,
    });
    const rows = await settlementsDb.listSettlementsForTask(taskId);
    expect(rows).toHaveLength(2);
  });

  it("sessions: issue → get → patch → delete", async () => {
    const token = `tok_${randomUUID()}`;
    await sessionsDb.issueSession({
      token,
      kind: "registration",
      wallet: null,
      data: { stage: "pending" },
      expiresAt: new Date(Date.now() + 600_000),
    });
    const got = await sessionsDb.getSession(token);
    expect(got?.kind).toBe("registration");
    await sessionsDb.setSessionWallet(token, AGENT_WALLET);
    const got2 = await sessionsDb.getSession(token);
    expect(got2?.wallet).toBe(AGENT_WALLET);
    await sessionsDb.deleteSession(token);
    const got3 = await sessionsDb.getSession(token);
    expect(got3).toBeUndefined();
  });

  it("nonces: consume returns true once, false on second call", async () => {
    const v = `nonce_${randomUUID()}`;
    expect(await noncesDb.consumeNonce(v)).toBe(true);
    expect(await noncesDb.consumeNonce(v)).toBe(false);
  });
});
