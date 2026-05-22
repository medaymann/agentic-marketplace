import { describe, it, expect, beforeAll } from "vitest";
import { runner } from "node-pg-migrate";
import pg from "pg";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

beforeAll(async () => {
  process.env["DATABASE_URL"] ??= "postgresql://basira:basira@localhost:5432/basira";
  process.env["SOLANA_RPC_URL"] ??= "https://api.devnet.solana.com";
  process.env["SOLANA_WS_URL"] ??= "wss://api.devnet.solana.com";
  process.env["PROGRAM_ID"] ??= "9Lc7odoQ3TWXo6yZWnYnGXmAsFNP3Gh6NYgxNhhaxvkj";
  process.env["KEEPER_KEYPAIR_PATH"] ??= "../keypairs/keeper.json";
  process.env["ARBITRATOR_KEYPAIR_PATH"] ??= "../keypairs/arbitrator.json";
  process.env["LLM_PROVIDER"] ??= "mock";
  process.env["LOG_LEVEL"] ??= "silent";
  process.env["NODE_ENV"] = "test";

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
});

describe("daemon_state cursor", () => {
  it("starts at 0, advances monotonically, persists across reads", async () => {
    const { daemonStateDb } = await import("@basira/shared");
    const initial = await daemonStateDb.getLastSeenSlot();
    expect(initial).toBe(0n);

    await daemonStateDb.setLastSeenSlot(12345n);
    const after = await daemonStateDb.getLastSeenSlot();
    expect(after).toBe(12345n);

    await daemonStateDb.setLastSeenSlot(99999n);
    expect(await daemonStateDb.getLastSeenSlot()).toBe(99999n);
  });
});
