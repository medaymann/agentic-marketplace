import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { Connection } from "@solana/web3.js";
import { runner } from "node-pg-migrate";
import pg from "pg";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

beforeAll(() => {
  process.env["DATABASE_URL"] ??= "postgresql://basira:basira@localhost:5432/basira";
  process.env["SOLANA_RPC_URL"] ??= "https://api.devnet.solana.com";
  process.env["SOLANA_WS_URL"] ??= "wss://api.devnet.solana.com";
  process.env["PROGRAM_ID"] ??= "DaAcmKvC3PLL4avmjLnfF2uNuYKaFjNYmmhRKYiXbqWV";
  process.env["KEEPER_KEYPAIR_PATH"] ??= "../keypairs/keeper.json";
  process.env["ARBITRATOR_KEYPAIR_PATH"] ??= "../keypairs/arbitrator.json";
  process.env["LLM_PROVIDER"] ??= "mock";
  process.env["LOG_LEVEL"] ??= "silent";
  process.env["NODE_ENV"] = "test";
});

async function resetDb(): Promise<void> {
  const databaseUrl = process.env["DATABASE_URL"]!;
  const pool = new pg.Pool({ connectionString: databaseUrl });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await pool.end();
  await runner({
    databaseUrl,
    dir: resolve(__dirname, "..", "..", "..", "shared", "migrations"),
    migrationsTable: "pgmigrations",
    direction: "up",
    log: () => {},
  });
}

const POSTER = "Bddo2ek21cs8SmArWa7c3GTu8VQnAiKzs7fc1T3AF2hc";
const AGENT = "93c9Z2uWbmcQjV1oh8eAYZtvXGLXRJQLXXjCmYkyiiju";

async function seedAgent(wallet: string): Promise<void> {
  const { agentsDb } = await import("@basira/shared");
  const exists = await agentsDb.getAgentByWallet(wallet);
  if (!exists) {
    await agentsDb.insertPendingAgent({
      wallet,
      name: "agent",
      description: "x",
      capabilities: "x",
      capabilityTags: ["x"],
      endpointUrl: "https://example.invalid",
      maxResponseSeconds: 60,
      defaultMaxDeliverySeconds: 3600,
      supportedCurrencies: ["SOL"],
      minTaskRewardUsdc: 0n,
    });
    await agentsDb.setRegistrationStage(wallet, "complete");
  }
}

const fakeConnection = {
  getLatestBlockhash: async () => ({
    blockhash: "FakeBlockhash11111111111111111111111111111111",
    lastValidBlockHeight: 1,
  }),
} as unknown as Connection;

describe("auto-dispute sweep", () => {
  beforeEach(async () => {
    await resetDb();
    vi.resetModules();
    vi.doMock("../../src/cron/_send.js", () => ({
      signAndBroadcast: async () => ({ signature: "mock-sig" }),
    }));
  });

  it("selects only old submitted tasks with FAIL verdict and no dispute", async () => {
    await seedAgent(AGENT);
    const { tasksDb, judgeVerdictsDb, disputesDb } = await import("@basira/shared");

    async function seed(opts: { age: "old" | "new"; verdict?: "pass" | "fail"; hasDispute?: boolean }) {
      const taskId = randomUUID();
      const submittedAt =
        opts.age === "old"
          ? new Date(Date.now() - 25 * 3_600_000)
          : new Date(Date.now() - 1 * 3_600_000);
      await tasksDb.insertTask({
        taskId,
        posterWallet: POSTER,
        posterKind: "human",
        assignedAgent: AGENT,
        mode: "direct",
        title: "x",
        description: "x",
        acceptanceCriteria: ["x"],
        currency: "SOL",
        amount: 10_000_000n,
        deadline: new Date(Date.now() + 7_200_000),
        status: "submitted",
      });
      await tasksDb.setSubmittedAt(taskId, submittedAt);
      if (opts.verdict) {
        await judgeVerdictsDb.insertVerdict({
          taskId,
          verdict: opts.verdict,
          confidence: 0.9,
          reasoning: "test",
          failedCriteria: [],
          model: "mock",
          promptVersion: "judge-v1",
        });
      }
      if (opts.hasDispute) {
        await disputesDb.openDispute({ taskId, openedBy: POSTER, reason: "x" });
      }
      return taskId;
    }

    await seed({ age: "old", verdict: "fail" }); // candidate
    await seed({ age: "old", verdict: "pass" }); // skip
    await seed({ age: "new", verdict: "fail" }); // not selected (too new)
    await seed({ age: "old", verdict: "fail", hasDispute: true }); // skip

    const { runAutoDisputeSweep } = await import("../../src/cron/auto-dispute.js");
    const result = await runAutoDisputeSweep(fakeConnection);
    expect(result.sent).toBe(1);
    expect(result.skipped).toBe(2);
  });
});

describe("expire sweep", () => {
  beforeEach(async () => {
    await resetDb();
    vi.resetModules();
    vi.doMock("../../src/cron/_send.js", () => ({
      signAndBroadcast: async () => ({ signature: "mock-sig" }),
    }));
  });

  it("selects tasks past deadline in created/assigned status", async () => {
    await seedAgent(AGENT);
    const { tasksDb } = await import("@basira/shared");

    async function seed(opts: { status: string; deadline: "past" | "future"; assignedAgent?: string | null }) {
      const taskId = randomUUID();
      await tasksDb.insertTask({
        taskId,
        posterWallet: POSTER,
        posterKind: "human",
        assignedAgent: opts.assignedAgent ?? null,
        mode: opts.assignedAgent ? "direct" : "bounty",
        title: "x",
        description: "x",
        acceptanceCriteria: ["x"],
        currency: "SOL",
        amount: 10_000_000n,
        deadline:
          opts.deadline === "past"
            ? new Date(Date.now() - 60_000)
            : new Date(Date.now() + 3_600_000),
        status: opts.status,
      });
      return taskId;
    }

    await seed({ status: "created", deadline: "past" }); // candidate
    await seed({ status: "assigned", deadline: "past", assignedAgent: AGENT }); // candidate
    await seed({ status: "submitted", deadline: "past", assignedAgent: AGENT }); // skip (wrong status, but in submitted DB doesn't match query)
    await seed({ status: "created", deadline: "future" }); // skip (not past)

    process.env["LOG_LEVEL"] = "debug";
    const { runExpireSweep } = await import("../../src/cron/expire.js");
    const result = await runExpireSweep(fakeConnection);
    process.env["LOG_LEVEL"] = "silent";
    expect(result.swept).toBe(2);
    expect(result.sent).toBe(2);
  });
});

describe("ghost-dispute sweep", () => {
  beforeEach(async () => {
    await resetDb();
    vi.resetModules();
    vi.doMock("../../src/cron/_send.js", () => ({
      signAndBroadcast: async () => ({ signature: "mock-sig" }),
    }));
  });

  it("selects open disputes with no agent_response older than 48h", async () => {
    await seedAgent(AGENT);
    const { tasksDb } = await import("@basira/shared");

    async function seed(opts: { disputeAge: "ghost" | "fresh"; agentResponded?: boolean }): Promise<string> {
      const taskId = randomUUID();
      await tasksDb.insertTask({
        taskId,
        posterWallet: POSTER,
        posterKind: "human",
        assignedAgent: AGENT,
        mode: "direct",
        title: "x",
        description: "x",
        acceptanceCriteria: ["x"],
        currency: "SOL",
        amount: 10_000_000n,
        deadline: new Date(Date.now() + 7_200_000),
        status: "disputed",
      });
      const openedAt =
        opts.disputeAge === "ghost"
          ? new Date(Date.now() - 49 * 3_600_000)
          : new Date(Date.now() - 1 * 3_600_000);
      // Insert directly to backdate opened_at.
      const { getDb } = await import("@basira/shared");
      await getDb()
        .insertInto("disputes")
        .values({
          task_id: taskId,
          opened_by: POSTER,
          reason: "x",
          opened_at: openedAt,
          ...(opts.agentResponded
            ? { agent_response: "I disagree", evidence_urls: [] }
            : {}),
        })
        .execute();
      return taskId;
    }

    await seed({ disputeAge: "ghost" }); // candidate
    await seed({ disputeAge: "ghost", agentResponded: true }); // skip
    await seed({ disputeAge: "fresh" }); // skip

    const { runGhostDisputeSweep } = await import("../../src/cron/ghost-disputes.js");
    const result = await runGhostDisputeSweep(fakeConnection);
    expect(result.swept).toBe(1);
    expect(result.sent).toBe(1);
  });
});
