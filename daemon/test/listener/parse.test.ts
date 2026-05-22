import { describe, it, expect, beforeAll } from "vitest";
import { PublicKey } from "@solana/web3.js";
import type { ParsedTransactionWithMeta, PartiallyDecodedInstruction } from "@solana/web3.js";

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

const PROGRAM_ID = new PublicKey("9Lc7odoQ3TWXo6yZWnYnGXmAsFNP3Gh6NYgxNhhaxvkj");

function makeIx(programId: PublicKey, accounts: PublicKey[]): PartiallyDecodedInstruction {
  return { programId, accounts, data: "" };
}

function makeTx(opts: {
  programIxs: { programId: PublicKey; accounts: PublicKey[]; logName: string }[];
  slot?: number;
  blockTime?: number;
}): ParsedTransactionWithMeta {
  const logMessages = opts.programIxs.flatMap((ix) => [
    `Program ${ix.programId.toBase58()} invoke [1]`,
    `Program log: Instruction: ${ix.logName}`,
    `Program ${ix.programId.toBase58()} success`,
  ]);
  return {
    slot: opts.slot ?? 100,
    blockTime: opts.blockTime ?? 1700000000,
    transaction: {
      message: {
        instructions: opts.programIxs.map((ix) => makeIx(ix.programId, ix.accounts)),
        accountKeys: [],
        recentBlockhash: "",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      signatures: [],
    },
    meta: {
      err: null,
      fee: 5000,
      preBalances: [],
      postBalances: [],
      logMessages,
      innerInstructions: [],
      preTokenBalances: [],
      postTokenBalances: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };
}

describe("parseTransaction", () => {
  it("extracts instruction names from logs and accounts from message", async () => {
    const { parseTransaction } = await import("../../src/listener/parse.js");
    const taskAcct = PublicKey.unique();
    const poster = PublicKey.unique();
    const tx = makeTx({
      programIxs: [
        {
          programId: PROGRAM_ID,
          accounts: [poster, taskAcct],
          logName: "OpenDispute",
        },
      ],
    });
    const parsed = parseTransaction(tx, PROGRAM_ID, "sig1");
    expect(parsed?.instructions).toHaveLength(1);
    expect(parsed!.instructions[0]!.name).toBe("OpenDispute");
    expect(parsed!.instructions[0]!.accounts[1]!.toBase58()).toBe(taskAcct.toBase58());
  });

  it("ignores instructions targeting other programs", async () => {
    const { parseTransaction } = await import("../../src/listener/parse.js");
    const systemProgram = new PublicKey("11111111111111111111111111111111");
    // System program does NOT emit "Program log: Instruction:" lines.
    // Build the tx by hand to match realistic logs.
    const taskAcct = PublicKey.unique();
    const programIxStr = PROGRAM_ID.toBase58();
    const tx = {
      slot: 100,
      blockTime: 1700000000,
      transaction: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        message: {
          instructions: [
            { programId: systemProgram, accounts: [PublicKey.unique()], data: "" },
            { programId: PROGRAM_ID, accounts: [PublicKey.unique(), taskAcct], data: "" },
          ],
          accountKeys: [],
          recentBlockhash: "",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
        signatures: [],
      },
      meta: {
        err: null,
        fee: 5000,
        preBalances: [],
        postBalances: [],
        logMessages: [
          `Program ${systemProgram.toBase58()} invoke [1]`,
          `Program ${systemProgram.toBase58()} success`,
          `Program ${programIxStr} invoke [1]`,
          `Program log: Instruction: SubmitDeliverable`,
          `Program ${programIxStr} success`,
        ],
        innerInstructions: [],
        preTokenBalances: [],
        postTokenBalances: [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    const parsed = parseTransaction(tx, PROGRAM_ID, "sig2");
    expect(parsed?.instructions).toHaveLength(1);
    expect(parsed!.instructions[0]!.name).toBe("SubmitDeliverable");
    expect(parsed!.instructions[0]!.accounts[1]!.toBase58()).toBe(taskAcct.toBase58());
  });

  it("returns empty instructions array when no matches", async () => {
    const { parseTransaction } = await import("../../src/listener/parse.js");
    const tx = makeTx({
      programIxs: [
        {
          programId: new PublicKey("11111111111111111111111111111111"),
          accounts: [],
          logName: "Transfer",
        },
      ],
    });
    const parsed = parseTransaction(tx, PROGRAM_ID, "sig3");
    expect(parsed?.instructions).toHaveLength(0);
  });
});
