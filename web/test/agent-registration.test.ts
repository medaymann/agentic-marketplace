import { describe, it, expect } from "vitest";
import { agentPreRegisterInputSchema, agentRotateApiKeyInputSchema } from "@basira/shared";
import { serialize } from "../src/lib/serialize";

describe("serialize", () => {
  it("converts bigint to string", () => {
    expect(serialize({ amount: 10_000_000n })).toEqual({ amount: "10000000" });
  });
  it("converts Date to ISO string", () => {
    const d = new Date("2026-05-10T12:00:00Z");
    expect(serialize({ at: d })).toEqual({ at: "2026-05-10T12:00:00.000Z" });
  });
  it("recurses into nested objects and arrays", () => {
    expect(serialize({ items: [{ amount: 1n }, { amount: 2n }] })).toEqual({
      items: [{ amount: "1" }, { amount: "2" }],
    });
  });
  it("converts PublicKey to base58 string", async () => {
    const { PublicKey } = await import("@solana/web3.js");
    const pk = new PublicKey("8aE43P1sYxHqBZmKJhJfKqZqS3GmZG8vJgQvJM5R4mX");
    const result = serialize({ wallet: pk });
    expect(result.wallet).toBe("8aE43P1sYxHqBZmKJhJfKqZqS3GmZG8vJgQvJM5R4mX");
  });
});

describe("agentPreRegisterInputSchema", () => {
  it("accepts valid input", () => {
    const result = agentPreRegisterInputSchema.safeParse({
      wallet: "8aE43P1sYxHqBZmKJhJfKqZqS3GmZG8vJgQvJM5R4mX",
      name: "TestAgent",
      description: "A test agent",
      capabilities: "web scraping",
      capabilityTags: ["http", "parsing"],
      endpointUrl: "https://agent.example/health",
      maxResponseSeconds: 60,
      defaultMaxDeliverySeconds: 3600,
      supportedCurrencies: ["SOL"],
      minTaskRewardUsdc: 0n,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid wallet", () => {
    const result = agentPreRegisterInputSchema.safeParse({
      wallet: "not-a-valid-solana-address",
      name: "TestAgent",
      description: "A test agent",
      capabilities: "web scraping",
      capabilityTags: ["http"],
      endpointUrl: "https://agent.example/health",
      supportedCurrencies: ["SOL"],
    });
    expect(result.success).toBe(false);
  });
});

describe("agentRotateApiKeyInputSchema", () => {
  it("accepts valid structure", () => {
    const result = agentRotateApiKeyInputSchema.safeParse({
      wallet: "8aE43P1sYxHqBZmKJhJfKqZqS3GmZG8vJgQvJM5R4mX",
      message: "Rotate API key",
      signature: "4XK3pV5eV5pYs5fJYhPqYXcVJqZqS3GmZG8vJgQvJM5R4mX4XK3pV5eV5pYs5fJYhPqYXcVJqZqS3GmZG8vJgQvJM5R4mX4XK3pV5eV5pYs5fJYhPqYXcVJqZq",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid wallet", () => {
    const result = agentRotateApiKeyInputSchema.safeParse({
      wallet: "short",
      message: "Rotate API key",
      signature: "abc",
    });
    expect(result.success).toBe(false);
  });
});