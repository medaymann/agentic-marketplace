import { describe, it, expect, beforeAll } from "vitest";

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

describe("lifecycle", () => {
  it("loads env from process.env without throwing", async () => {
    const { getEnv } = await import("../src/env.js");
    const env = getEnv();
    expect(env.PROGRAM_ID).toBe("9Lc7odoQ3TWXo6yZWnYnGXmAsFNP3Gh6NYgxNhhaxvkj");
    expect(env.HEALTH_PORT).toBe(8080);
  });

  it("loads keeper and arbitrator keypairs from configured paths", async () => {
    const { loadKeeperKeypair, loadArbitratorKeypair } = await import("../src/keys.js");
    const keeper = loadKeeperKeypair();
    const arb = loadArbitratorKeypair();
    expect(keeper.publicKey.toBase58()).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    expect(arb.publicKey.toBase58()).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  });

  it("stopDaemon is safe to call before start", async () => {
    const { stopDaemon } = await import("../src/lifecycle.js");
    await stopDaemon();
  });
});
