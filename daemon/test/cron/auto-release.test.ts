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

async function seedSubmittedTask(opts: {
  age: "old" | "new";
  hasDispute?: boolean;
  verdict?: "pass" | "fail" | "unavailable" | "absent";
}): Promise<string> {
  const { tasksDb, disputesDb, judgeVerdictsDb } = await import("@basira/shared");
  await seedAgent(AGENT);
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
  if (opts.verdict && opts.verdict !== "absent") {
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

describe("auto-release sweep — selection logic (no broadcast)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("selects only old tasks with PASS or unavailable verdict and no open dispute", async () => {
    const idPass = await seedSubmittedTask({ age: "old", verdict: "pass" });
    const idUnavailable = await seedSubmittedTask({ age: "old", verdict: "unavailable" });
    const idAbsent = await seedSubmittedTask({ age: "old", verdict: "absent" });
    await seedSubmittedTask({ age: "old", verdict: "fail" }); // skip
    await seedSubmittedTask({ age: "new", verdict: "pass" }); // skip (too new)
    await seedSubmittedTask({ age: "old", verdict: "pass", hasDispute: true }); // skip

    // Stub the broadcast: replace signAndBroadcast import via vitest mock.
    const sentSigs: string[] = [];
    vi.doMock("../../src/cron/_send.js", () => ({
      signAndBroadcast: async () => {
        const sig = `mock-sig-${sentSigs.length}`;
        sentSigs.push(sig);
        return { signature: sig };
      },
    }));

    // The connection is not actually used for the candidate query; only for
    // getLatestBlockhash and the broadcast (mocked). Stub getLatestBlockhash too.
    const fakeConnection = {
      getLatestBlockhash: async () => ({
        blockhash: "FakeBlockhash11111111111111111111111111111111",
        lastValidBlockHeight: 1,
      }),
    } as unknown as Connection;

    // Re-import the cron after mocking.
    const { runAutoReleaseSweep } = await import("../../src/cron/auto-release.js");
    const result = await runAutoReleaseSweep(fakeConnection);

    // listSubmittedOlderThan returns 5 old tasks (pass, unavailable, absent, fail, pass+dispute).
    // The new task (age=new) is filtered out by the query.
    expect(result.swept).toBe(5);
    expect(result.sent).toBe(3); // pass, unavailable, absent
    expect(result.skipped).toBe(2); // fail + pass-with-dispute
    expect(sentSigs).toHaveLength(3);
    void idPass; void idUnavailable; void idAbsent;
    vi.doUnmock("../../src/cron/_send.js");
    vi.resetModules();
  });
});
