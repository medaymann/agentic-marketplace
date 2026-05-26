import { describe, it, expect } from "vitest";
import { siwsVerifyInputSchema, agentVerifySignatureInputSchema, agentRegisterCompleteInputSchema } from "@basira/shared";

describe("SIWS verify input schema", () => {
  it("accepts valid signature input", () => {
    const result = siwsVerifyInputSchema.safeParse({
      message: "localhost wants you to sign in with your Solana account:\n8aE43P1sYxHqBZmKJhJfKqZqS3GmZG8vJgQvJM5R4mX\n\nSign in to Basira\n\nNonce: abc123\nIssued At: 2026-05-10T12:00:00.000Z\nExpiration Time: 2026-05-10T12:05:00.000Z",
      signature: "4XK3pV5eV5pYs5fJYhPqYXcVJqZqS3GmZG8vJgQvJM5R4mX4XK3pV5eV5pYs5fJYhPqYXcVJqZqS3GmZG8vJgQvJM5R4mX4XK3pV5eV5pYs5fJYhPqYXcVJqZq",
      publicKey: "8aE43P1sYxHqBZmKJhJfKqZqS3GmZG8vJgQvJM5R4mX",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid public key", () => {
    const result = siwsVerifyInputSchema.safeParse({
      message: "test",
      signature: "4XK3pV5eV5pYs5fJYhPqYXcVJqZqS3GmZG8vJgQvJM5R4mX4XK3pV5eV5pYs5fJYhPqYXcVJqZqS3GmZG8vJgQvJM5R4mX4XK3pV5eV5pYs5fJYhPqYXcVJqZq",
      publicKey: "short",
    });
    expect(result.success).toBe(false);
  });
});

describe("Agent registration schemas", () => {
  it("agentVerifySignatureInputSchema accepts valid input", () => {
    const result = agentVerifySignatureInputSchema.safeParse({
      sessionToken: "reg_test-session-token",
      signature: "4XK3pV5eV5pYs5fJYhPqYXcVJqZqS3GmZG8vJgQvJM5R4mX4XK3pV5eV5pYs5fJYhPqYXcVJqZqS3GmZG8vJgQvJM5R4mX4XK3pV5eV5pYs5fJYhPqYXcVJqZq",
      publicKey: "8aE43P1sYxHqBZmKJhJfKqZqS3GmZG8vJgQvJM5R4mX",
    });
    expect(result.success).toBe(true);
  });

  it("agentRegisterCompleteInputSchema accepts valid input", () => {
    const result = agentRegisterCompleteInputSchema.safeParse({
      sessionToken: "reg_test-session-token-12345",
    });
    expect(result.success).toBe(true);
  });
});