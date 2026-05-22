import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { Connection, PublicKey } from "@solana/web3.js";
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

const POSTER = "Bddo2ek21cs8SmArWa7c3GTu8VQnAiKzs7fc1T3AF2hc";
const AGENT = "93c9Z2uWbmcQjV1oh8eAYZtvXGLXRJQLXXjCmYkyiiju";

describe("reconcile handlers", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function seedTask(opts: {
    status: string;
    assignedAgent?: string | null;
    pda: PublicKey;
    amount?: bigint;
  }): Promise<string> {
    const { tasksDb, agentsDb } = await import("@basira/shared");
    // Seed agent if needed (FK from tasks.assigned_agent → agents.wallet)
    if (opts.assignedAgent) {
      const exists = await agentsDb.getAgentByWallet(opts.assignedAgent);
      if (!exists) {
        await agentsDb.insertPendingAgent({
          wallet: opts.assignedAgent,
          name: "test-agent",
          description: "x",
          capabilities: "x",
          capabilityTags: ["x"],
          endpointUrl: "https://example.invalid",
          maxResponseSeconds: 60,
          defaultMaxDeliverySeconds: 3600,
          supportedCurrencies: ["SOL"],
          minTaskRewardUsdc: 0n,
        });
        await agentsDb.setRegistrationStage(opts.assignedAgent, "complete");
      }
    }
    const taskId = randomUUID();
    await tasksDb.insertTask({
      taskId,
      posterWallet: POSTER,
      posterKind: "human",
      assignedAgent: opts.assignedAgent ?? null,
      mode: opts.assignedAgent ? "direct" : "bounty",
      title: "test task",
      description: "test description",
      acceptanceCriteria: ["ok"],
      currency: "SOL",
      amount: opts.amount ?? 10_000_000n,
      deadline: new Date(Date.now() + 7_200_000),
      status: opts.status,
      taskPda: opts.pda.toBase58(),
    });
    return taskId;
  }

  it("AssignAgent: created → assigned, emits no settlement", async () => {
    const { reconcileTransaction } = await import("../../src/listener/reconcile.js");
    const { tasksDb } = await import("@basira/shared");
    const taskPda = PublicKey.unique();
    const taskId = await seedTask({ status: "created", assignedAgent: AGENT, pda: taskPda });
    // The service layer set assigned_agent before broadcast; we set status back to created
    // to simulate the listener arriving on the assign_agent confirmation.
    await tasksDb.setTaskStatus(taskId, "created");

    const connection = new Connection("https://api.devnet.solana.com");
    await reconcileTransaction(
      {
        signature: "sig-assign",
        slot: 100,
        blockTime: Math.floor(Date.now() / 1000),
        instructions: [
          {
            name: "AssignAgent",
            accounts: [new PublicKey(POSTER), taskPda, PublicKey.unique()],
          },
        ],
      },
      connection,
    );

    const row = await tasksDb.getTaskById(taskId);
    expect(row?.status).toBe("assigned");
  });

  it("SubmitDeliverable: assigned → submitted, sets submitted_at", async () => {
    const { reconcileTransaction } = await import("../../src/listener/reconcile.js");
    const { tasksDb } = await import("@basira/shared");
    const taskPda = PublicKey.unique();
    const taskId = await seedTask({ status: "assigned", assignedAgent: AGENT, pda: taskPda });

    const connection = new Connection("https://api.devnet.solana.com");
    const blockTime = Math.floor(Date.now() / 1000);
    await reconcileTransaction(
      {
        signature: "sig-submit",
        slot: 101,
        blockTime,
        instructions: [
          { name: "SubmitDeliverable", accounts: [new PublicKey(AGENT), taskPda] },
        ],
      },
      connection,
    );

    const row = await tasksDb.getTaskById(taskId);
    expect(row?.status).toBe("submitted");
    expect(row?.submitted_at).not.toBeNull();
  });

  it("ApproveSol: submitted → settled, writes 2 settlement rows (release + fee)", async () => {
    const { reconcileTransaction } = await import("../../src/listener/reconcile.js");
    const { tasksDb, settlementsDb } = await import("@basira/shared");
    const taskPda = PublicKey.unique();
    const taskId = await seedTask({
      status: "submitted",
      assignedAgent: AGENT,
      pda: taskPda,
      amount: 10_000_000n,
    });

    const connection = new Connection("https://api.devnet.solana.com");
    await reconcileTransaction(
      {
        signature: "sig-approve",
        slot: 102,
        blockTime: Math.floor(Date.now() / 1000),
        instructions: [
          {
            name: "ApproveSol",
            accounts: [new PublicKey(POSTER), taskPda, PublicKey.unique(), new PublicKey(AGENT)],
          },
        ],
      },
      connection,
    );

    const row = await tasksDb.getTaskById(taskId);
    expect(row?.status).toBe("settled");
    const settlements = await settlementsDb.listSettlementsForTask(taskId);
    expect(settlements).toHaveLength(2);
    const release = settlements.find((s) => s.kind === "release");
    const fee = settlements.find((s) => s.kind === "fee");
    expect(release?.amount).toBe("9500000");
    expect(fee?.amount).toBe("500000");
    expect(release?.recipientWallet).toBe(AGENT);
  });

  it("ExpireTaskSol: assigned → expired, writes 1 refund settlement", async () => {
    const { reconcileTransaction } = await import("../../src/listener/reconcile.js");
    const { tasksDb, settlementsDb } = await import("@basira/shared");
    const taskPda = PublicKey.unique();
    const taskId = await seedTask({
      status: "assigned",
      assignedAgent: AGENT,
      pda: taskPda,
      amount: 5_000_000n,
    });

    const connection = new Connection("https://api.devnet.solana.com");
    await reconcileTransaction(
      {
        signature: "sig-expire",
        slot: 103,
        blockTime: Math.floor(Date.now() / 1000),
        instructions: [
          {
            name: "ExpireTaskSol",
            accounts: [
              new PublicKey(POSTER), // caller
              taskPda,
              PublicKey.unique(), // vault
              new PublicKey(POSTER), // poster_wallet
              PublicKey.unique(), // agent_account
            ],
          },
        ],
      },
      connection,
    );

    const row = await tasksDb.getTaskById(taskId);
    expect(row?.status).toBe("expired");
    const settlements = await settlementsDb.listSettlementsForTask(taskId);
    expect(settlements).toHaveLength(1);
    expect(settlements[0]!.kind).toBe("refund");
    expect(settlements[0]!.amount).toBe("5000000");
    expect(settlements[0]!.recipientWallet).toBe(POSTER);
  });

  it("idempotent on replay: feeding the same approve tx twice yields one set of settlements", async () => {
    const { reconcileTransaction } = await import("../../src/listener/reconcile.js");
    const { settlementsDb, tasksDb } = await import("@basira/shared");
    const taskPda = PublicKey.unique();
    const taskId = await seedTask({
      status: "submitted",
      assignedAgent: AGENT,
      pda: taskPda,
      amount: 10_000_000n,
    });

    const connection = new Connection("https://api.devnet.solana.com");
    const txInput = {
      signature: "sig-approve-dupe",
      slot: 102,
      blockTime: Math.floor(Date.now() / 1000),
      instructions: [
        {
          name: "ApproveSol" as const,
          accounts: [new PublicKey(POSTER), taskPda, PublicKey.unique(), new PublicKey(AGENT)],
        },
      ],
    };
    await reconcileTransaction(txInput, connection);
    await reconcileTransaction(txInput, connection); // replay

    const row = await tasksDb.getTaskById(taskId);
    expect(row?.status).toBe("settled");
    const settlements = await settlementsDb.listSettlementsForTask(taskId);
    expect(settlements).toHaveLength(2); // not 4 — UNIQUE on (tx_signature, kind, recipient) holds
  });

  it("unknown task PDA: handler logs warning and exits without throwing", async () => {
    const { reconcileTransaction } = await import("../../src/listener/reconcile.js");
    const connection = new Connection("https://api.devnet.solana.com");
    await expect(
      reconcileTransaction(
        {
          signature: "sig-orphan",
          slot: 200,
          blockTime: 1700000000,
          instructions: [
            {
              name: "ApproveSol",
              accounts: [
                PublicKey.unique(),
                PublicKey.unique(),
                PublicKey.unique(),
                PublicKey.unique(),
              ],
            },
          ],
        },
        connection,
      ),
    ).resolves.toBeUndefined();
  });
});
