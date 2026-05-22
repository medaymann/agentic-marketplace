import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import { runner } from "node-pg-migrate";
import pg from "pg";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

beforeAll(() => {
  process.env["DATABASE_URL"] ??= "postgresql://basira:basira@localhost:5432/basira";
  process.env["SOLANA_RPC_URL"] ??= "https://api.devnet.solana.com";
  process.env["SOLANA_WS_URL"] ??= "wss://api.devnet.solana.com";
  process.env["PROGRAM_ID"] ??= "9Lc7odoQ3TWXo6yZWnYnGXmAsFNP3Gh6NYgxNhhaxvkj";
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

async function startServer(handler: (status: number) => number): Promise<{ server: Server; port: number; calls: { count: number } }> {
  const calls = { count: 0 };
  const server = createServer((req, res) => {
    calls.count++;
    const status = handler(calls.count);
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: status === 200 }));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (addr === null || typeof addr === "string") throw new Error("no port");
  return { server, port: addr.port, calls };
}

const AGENT = "93c9Z2uWbmcQjV1oh8eAYZtvXGLXRJQLXXjCmYkyiiju";

async function seedAgentWithEndpoint(endpointUrl: string): Promise<void> {
  const { agentsDb } = await import("@basira/shared");
  await agentsDb.insertPendingAgent({
    wallet: AGENT,
    name: "agent",
    description: "x",
    capabilities: "x",
    capabilityTags: ["x"],
    endpointUrl,
    maxResponseSeconds: 60,
    defaultMaxDeliverySeconds: 3600,
    supportedCurrencies: ["SOL"],
    minTaskRewardUsdc: 0n,
  });
  await agentsDb.setApiKeyHash(AGENT, "hash", randomBytes(32).toString("hex"));
}

describe("webhook retry sweep", () => {
  let server: Server | null = null;

  beforeEach(async () => {
    await resetDb();
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((r) => server!.close(() => r()));
      server = null;
    }
  });

  it("delivers a pending webhook on success", async () => {
    const setup = await startServer(() => 200);
    server = setup.server;
    await seedAgentWithEndpoint(`http://127.0.0.1:${setup.port}`);

    const { webhookDeliveriesDb } = await import("@basira/shared");
    const delivery = await webhookDeliveriesDb.enqueue({
      agentWallet: AGENT,
      event: "task.offered",
      payload: { taskId: "abc" },
    });

    const { runWebhookRetrySweep } = await import("../../src/cron/retry-webhooks.js");
    const result = await runWebhookRetrySweep();
    expect(result.delivered).toBe(1);
    expect(result.failed).toBe(0);
    expect(setup.calls.count).toBe(1);
    void delivery;
  });

  it("schedules retry on failure; permanent-fail after MAX_ATTEMPTS", async () => {
    const setup = await startServer(() => 500);
    server = setup.server;
    await seedAgentWithEndpoint(`http://127.0.0.1:${setup.port}`);

    const { webhookDeliveriesDb, getDb } = await import("@basira/shared");
    const delivery = await webhookDeliveriesDb.enqueue({
      agentWallet: AGENT,
      event: "task.offered",
      payload: { taskId: "abc" },
    });
    void delivery;

    const { runWebhookRetrySweep } = await import("../../src/cron/retry-webhooks.js");

    // First attempt: failure → retried
    const r1 = await runWebhookRetrySweep();
    expect(r1.delivered).toBe(0);
    expect(r1.retried).toBe(1);

    // Force next_retry_at into the past so we can sweep again immediately.
    await getDb()
      .updateTable("webhook_deliveries")
      .set({ next_retry_at: new Date(0) })
      .where("agent_wallet", "=", AGENT)
      .execute();

    // Second attempt
    const r2 = await runWebhookRetrySweep();
    expect(r2.retried).toBe(1);
    await getDb()
      .updateTable("webhook_deliveries")
      .set({ next_retry_at: new Date(0) })
      .where("agent_wallet", "=", AGENT)
      .execute();

    // Third attempt: scheduleNextRetry permanently fails after attempts >= MAX
    const r3 = await runWebhookRetrySweep();
    expect(r3.failed).toBe(1);

    // Fourth sweep should find no candidates (status=failed)
    const r4 = await runWebhookRetrySweep();
    expect(r4.swept).toBe(0);
  });
});
