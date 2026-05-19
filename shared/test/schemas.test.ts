import { describe, expect, it } from "vitest";
import {
  agentPreRegisterInputSchema,
  bountyApplicationInputSchema,
  deliverableSubmitInputSchema,
  disputeOpenInputSchema,
  judgeOutputSchema,
  presignedUploadRequestSchema,
  settlementRowSchema,
  siwsVerifyInputSchema,
  taskCreateInputSchema,
  walletAddressSchema,
  webhookEventSchema,
} from "../src/schemas/index";

const VALID_WALLET = "DaAcmKvC3PLL4avmjLnfF2uNuYKaFjNYmmhRKYiXbqWV";
const VALID_WALLET_2 = "Bddo2ek21cs8SmArWa7c3GTu8VQnAiKzs7fc1T3AF2hc";
const VALID_UUID = "00000000-0000-4000-8000-000000000001";
const VALID_TX_SIG =
  "2cx5davrzUCih2bpeKTmxNhm9WhQ52vGcCpXVm7xVd6m3EvBbxEt7q7xXvMbsDF1WgcgkcJSguVRGY7ZuHuUAyoj";

describe("walletAddressSchema", () => {
  it("accepts a 32-byte base58 pubkey", () => {
    expect(walletAddressSchema.parse(VALID_WALLET)).toBe(VALID_WALLET);
  });
  it("rejects non-base58 strings", () => {
    expect(() => walletAddressSchema.parse("not-a-wallet!!!")).toThrow();
  });
  it("rejects 64-byte signatures (wrong length)", () => {
    expect(() => walletAddressSchema.parse(VALID_TX_SIG)).toThrow();
  });
});

describe("taskCreateInputSchema", () => {
  const baseDirect = {
    title: "Build a thing",
    description: "Build a small thing for me",
    acceptanceCriteria: ["it compiles", "it runs"],
    deadline: 1_900_000_000n,
    currency: "SOL" as const,
    amount: 100_000_000n,
    mode: "direct" as const,
    assignedAgent: VALID_WALLET,
  };

  it("accepts a valid direct SOL task", () => {
    expect(taskCreateInputSchema.parse(baseDirect)).toMatchObject({
      mode: "direct",
      assignedAgent: VALID_WALLET,
    });
  });

  it("accepts a valid bounty USDC task", () => {
    const parsed = taskCreateInputSchema.parse({
      title: "Open bounty",
      description: "anyone can apply",
      acceptanceCriteria: ["meets spec"],
      deadline: 1_900_000_000n,
      currency: "USDC",
      amount: 1_000_000n,
      mode: "bounty",
    });
    expect(parsed.mode).toBe("bounty");
  });

  it("rejects mode=direct without assignedAgent", () => {
    const { assignedAgent: _omit, ...withoutAgent } = baseDirect;
    void _omit;
    expect(() => taskCreateInputSchema.parse(withoutAgent)).toThrow();
  });

  it("rejects amount as a regular number (must be bigint)", () => {
    expect(() =>
      taskCreateInputSchema.parse({ ...baseDirect, amount: 100_000_000 }),
    ).toThrow();
  });

  it("rejects empty acceptance criteria", () => {
    expect(() =>
      taskCreateInputSchema.parse({ ...baseDirect, acceptanceCriteria: [] }),
    ).toThrow();
  });
});

describe("agentPreRegisterInputSchema", () => {
  it("accepts a complete agent registration input", () => {
    const parsed = agentPreRegisterInputSchema.parse({
      wallet: VALID_WALLET,
      name: "demo agent",
      description: "echoes inputs",
      capabilities: "echo",
      capabilityTags: ["echo", "demo"],
      endpointUrl: "https://example.com/agent",
      supportedCurrencies: ["SOL"],
      minTaskRewardUsdc: 0n,
    });
    expect(parsed.maxResponseSeconds).toBe(60); // default
  });

});

describe("bountyApplicationInputSchema", () => {
  it("accepts a normal application", () => {
    const parsed = bountyApplicationInputSchema.parse({
      taskId: VALID_UUID,
      message: "I can do this",
    });
    expect(parsed.taskId).toBe(VALID_UUID);
  });
  it("rejects empty message", () => {
    expect(() =>
      bountyApplicationInputSchema.parse({ taskId: VALID_UUID, message: "" }),
    ).toThrow();
  });
});

describe("deliverableSubmitInputSchema", () => {
  it("accepts valid input with default empty fileUrls", () => {
    const parsed = deliverableSubmitInputSchema.parse({
      taskId: VALID_UUID,
      contentText: "here is the work",
    });
    expect(parsed.fileUrls).toEqual([]);
  });
  it("rejects bad URL in fileUrls", () => {
    expect(() =>
      deliverableSubmitInputSchema.parse({
        taskId: VALID_UUID,
        contentText: "x",
        fileUrls: ["not a url"],
      }),
    ).toThrow();
  });
});

describe("presignedUploadRequestSchema", () => {
  it("rejects > 50MB sizeBytes", () => {
    expect(() =>
      presignedUploadRequestSchema.parse({
        taskId: VALID_UUID,
        filename: "x.txt",
        contentType: "text/plain",
        sizeBytes: 60 * 1024 * 1024,
      }),
    ).toThrow();
  });
});

describe("judgeOutputSchema", () => {
  it("accepts a pass verdict", () => {
    expect(
      judgeOutputSchema.parse({
        verdict: "pass",
        confidence: 0.9,
        reasoning: "looks good",
      }).failedCriteria,
    ).toEqual([]);
  });
  it("rejects confidence > 1", () => {
    expect(() =>
      judgeOutputSchema.parse({
        verdict: "pass",
        confidence: 1.5,
        reasoning: "x",
      }),
    ).toThrow();
  });
});

describe("disputeOpenInputSchema", () => {
  it("accepts valid input", () => {
    expect(
      disputeOpenInputSchema.parse({
        taskId: VALID_UUID,
        reason: "not what I asked for",
      }).reason,
    ).toBeTypeOf("string");
  });
});

describe("settlementRowSchema", () => {
  it("accepts a valid settlement row", () => {
    expect(
      settlementRowSchema.parse({
        id: VALID_UUID,
        taskId: VALID_UUID,
        kind: "release",
        recipientWallet: VALID_WALLET_2,
        currency: "SOL",
        amount: 95_000_000n,
        txSignature: VALID_TX_SIG,
        createdAt: new Date(),
      }).kind,
    ).toBe("release");
  });
  it("rejects an invalid tx signature", () => {
    expect(() =>
      settlementRowSchema.parse({
        id: VALID_UUID,
        taskId: VALID_UUID,
        kind: "release",
        recipientWallet: VALID_WALLET_2,
        currency: "SOL",
        amount: 1n,
        txSignature: "too-short",
        createdAt: new Date(),
      }),
    ).toThrow();
  });
});

describe("siwsVerifyInputSchema", () => {
  it("accepts valid input", () => {
    expect(
      siwsVerifyInputSchema.parse({
        message: "basira.xyz wants you to sign in",
        signature: "abc",
        publicKey: VALID_WALLET,
      }).publicKey,
    ).toBe(VALID_WALLET);
  });
});

describe("webhookEventSchema", () => {
  it("accepts known events", () => {
    expect(webhookEventSchema.parse("task.offered")).toBe("task.offered");
  });
  it("rejects unknown events", () => {
    expect(() => webhookEventSchema.parse("task.exploded")).toThrow();
  });
});
