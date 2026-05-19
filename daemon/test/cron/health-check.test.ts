import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { createServer, type Server, type IncomingMessage } from "node:http";
import { runner } from "node-pg-migrate";
import pg from "pg";
import { Keypair } from "@solana/web3.js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { randomBytes } from "node:crypto";

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

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
  });
}

async function startAgentServer(opts: {
  agentKp: Keypair;
  responseStrategy: (callCount: number) => "ok" | "bad-sig" | "500";
}): Promise<{ server: Server; port: number; calls: { count: number } }> {
  const calls = { count: 0 };
  const server = createServer(async (req, res) => {
    calls.count++;
    const body = await readBody(req);
    const { nonce } = JSON.parse(body) as { nonce: string };
    const strategy = opts.responseStrategy(calls.count);
    if (strategy === "500") {
      res.writeHead(500);
      res.end("nope");
      return;
    }
    const bytes =
      strategy === "ok"
        ? nacl.sign.detached(new TextEncoder().encode(nonce), opts.agentKp.secretKey)
        : nacl.sign.detached(new TextEncoder().encode("WRONG"), opts.agentKp.secretKey);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        protocol_version: "1.0",
        status: "ok",
        signed_nonce: bs58.encode(bytes),
      }),
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (addr === null || typeof addr === "string") throw new Error("no port");
  return { server, port: addr.port, calls };
}

async function seedAgent(wallet: string, endpointUrl: string): Promise<void> {
  const { agentsDb } = await import("@basira/shared");
  await agentsDb.insertPendingAgent({
    wallet,
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
  await agentsDb.setApiKeyHash(wallet, "hash", randomBytes(32).toString("hex"));
}

describe("health-check sweep", () => {
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

  it("succeeds when agent returns valid signed nonce", async () => {
    const agentKp = Keypair.generate();
    const setup = await startAgentServer({
      agentKp,
      responseStrategy: () => "ok",
    });
    server = setup.server;
    await seedAgent(agentKp.publicKey.toBase58(), `http://127.0.0.1:${setup.port}`);

    const { runHealthCheckSweep } = await import("../../src/cron/health-check.js");
    const result = await runHealthCheckSweep();
    expect(result.ok).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.deactivated).toBe(0);
  });

  it("deactivates agent after 3 consecutive failures (server returns 500)", async () => {
    const agentKp = Keypair.generate();
    const setup = await startAgentServer({
      agentKp,
      responseStrategy: () => "500",
    });
    server = setup.server;
    const wallet = agentKp.publicKey.toBase58();
    await seedAgent(wallet, `http://127.0.0.1:${setup.port}`);

    const { runHealthCheckSweep } = await import("../../src/cron/health-check.js");
    const { agentsDb } = await import("@basira/shared");

    await runHealthCheckSweep();
    await runHealthCheckSweep();
    let row = await agentsDb.getAgentByWallet(wallet);
    expect(row?.consecutive_health_failures).toBe(2);
    expect(row?.status).toBe("active");

    const r3 = await runHealthCheckSweep();
    expect(r3.deactivated).toBe(1);
    row = await agentsDb.getAgentByWallet(wallet);
    expect(row?.status).toBe("inactive");
  });

  it("rejects bogus signed_nonce signature", async () => {
    const agentKp = Keypair.generate();
    const setup = await startAgentServer({
      agentKp,
      responseStrategy: () => "bad-sig",
    });
    server = setup.server;
    await seedAgent(agentKp.publicKey.toBase58(), `http://127.0.0.1:${setup.port}`);

    const { runHealthCheckSweep } = await import("../../src/cron/health-check.js");
    const result = await runHealthCheckSweep();
    expect(result.ok).toBe(0);
    expect(result.failed).toBe(1);
  });
});
