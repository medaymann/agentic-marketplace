/**
 * Bankrun integration tests for shared Solana builder functions.
 * Loads the compiled basira.so and exercises each builder by signing
 * and landing transactions in a local bankrun context.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { startAnchor, BanksClient, ProgramTestContext } from "solana-bankrun";
import { BankrunProvider } from "anchor-bankrun";
import { Program, Idl } from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
} from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

import type { Basira } from "../src/solana/idl/basira";
import {
  taskIdFromUuid,
  taskPda,
  vaultPda,
  agentPda,
} from "../src/solana/pdas";
import { buildRegisterAgentTx } from "../src/solana/builders/register-agent";
import { buildCreateTaskSolTx } from "../src/solana/builders/create-task";
import { buildSubmitDeliverableTx } from "../src/solana/builders/submit-deliverable";
import { buildApproveSolTx } from "../src/solana/builders/approve";
import { buildOpenDisputeTx } from "../src/solana/builders/open-dispute";
import { buildCancelTaskSolTx } from "../src/solana/builders/cancel-task";
import { buildAssignAgentTx } from "../src/solana/builders/assign-agent";
import { TREASURY_ADDRESS } from "../src/solana/constants";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROGRAM_DIR = resolve(__dirname, "..", "..", "program");
const IDL = JSON.parse(
  readFileSync(resolve(PROGRAM_DIR, "target", "idl", "basira.json"), "utf8"),
) as Idl;

const KEYPAIRS_DIR = resolve(__dirname, "..", "..", "keypairs");
function loadKeypair(name: string): Keypair {
  const bytes = JSON.parse(
    readFileSync(resolve(KEYPAIRS_DIR, name), "utf8"),
  ) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

const TREASURY_KP = loadKeypair("treasury.json");
const KEEPER_KP = loadKeypair("keeper.json");

function freshUuid(): string {
  const b = randomBytes(16);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const hex = b.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const MIN_REWARD = 10_000_000n;
const HOUR = 3600;

describe("solana builders (bankrun)", () => {
  let context: ProgramTestContext;
  let banksClient: BanksClient;
  let program: Program<Basira>;

  function fund(pubkey: PublicKey, lamports = 5 * LAMPORTS_PER_SOL) {
    context.setAccount(pubkey, {
      lamports,
      data: Buffer.alloc(0),
      owner: SystemProgram.programId,
      executable: false,
      rentEpoch: 0,
    });
  }

  async function nowOnChain(): Promise<number> {
    const c = await banksClient.getClock();
    return Number(c.unixTimestamp);
  }

  async function getRecentBlockhash(): Promise<string> {
    const result = await banksClient.getLatestBlockhash();
    if (!result) throw new Error("getLatestBlockhash returned null");
    return result[0];
  }

  async function sendTx(tx: import("@solana/web3.js").VersionedTransaction) {
    const meta = await banksClient.processTransaction(tx);
    if (meta.logMessages) {
      const err = meta.logMessages.find((l) => l.includes("Error") || l.includes("failed"));
      if (err) throw new Error(err);
    }
  }

  // register_agent is keeper-signed: the platform authority (KEEPER_KP) signs
  // and pays; the agent wallet is passed as an argument and never signs.
  async function registerAgent(agentWallet: PublicKey): Promise<PublicKey> {
    fund(KEEPER_KP.publicKey);
    const rh = await getRecentBlockhash();
    const { tx, agentAccount } = await buildRegisterAgentTx({
      agentWallet,
      platformAuthority: KEEPER_KP.publicKey,
      recentBlockhash: rh,
      program,
    });
    tx.sign([KEEPER_KP]);
    await sendTx(tx);
    return agentAccount;
  }

  beforeAll(async () => {
    context = await startAnchor(
      PROGRAM_DIR,
      [],
      [
        {
          address: TREASURY_KP.publicKey,
          info: {
            lamports: 5 * LAMPORTS_PER_SOL,
            data: Buffer.alloc(0),
            owner: SystemProgram.programId,
            executable: false,
          },
        },
      ],
    );
    banksClient = context.banksClient;
    const provider = new BankrunProvider(context);
    program = new Program(IDL, provider) as unknown as Program<Basira>;
  }, 30_000);

  it("register_agent: builds and lands correctly (keeper-signed)", async () => {
    const agent = Keypair.generate();

    const agentAccount = await registerAgent(agent.publicKey);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const acc = await (program.account as any)["agentAccount"].fetch(agentAccount);
    expect(acc.wallet.toBase58()).toBe(agent.publicKey.toBase58());
  });

  it("create_task_sol + submit_deliverable + approve_sol: full happy path", async () => {
    const poster = Keypair.generate();
    const agent = Keypair.generate();
    fund(poster.publicKey);
    fund(agent.publicKey);
    fund(TREASURY_ADDRESS);
    fund(KEEPER_KP.publicKey);

    await registerAgent(agent.publicKey);

    const taskIdUuid = freshUuid();
    const now = await nowOnChain();
    const deadline = now + 2 * HOUR;

    // Create task (SOL, direct)
    {
      const rh = await getRecentBlockhash();
      const { tx } = await buildCreateTaskSolTx({
        taskIdUuid,
        mode: "direct",
        amount: MIN_REWARD,
        deadlineUnix: deadline,
        assignedAgent: agent.publicKey,
        poster: poster.publicKey,
        payer: poster.publicKey,
        recentBlockhash: rh,
        program,
      });
      tx.sign([poster]);
      await sendTx(tx);
    }

    // Submit deliverable — signed by the platform authority (keeper), not the agent.
    {
      const rh = await getRecentBlockhash();
      const { tx } = await buildSubmitDeliverableTx({
        taskIdUuid,
        platformAuthority: KEEPER_KP.publicKey,
        recentBlockhash: rh,
        program,
      });
      tx.sign([KEEPER_KP]);
      await sendTx(tx);
    }

    // Approve
    {
      const rh = await getRecentBlockhash();
      const { tx } = await buildApproveSolTx({
        taskIdUuid,
        poster: poster.publicKey,
        agentWallet: agent.publicKey,
        payer: poster.publicKey,
        recentBlockhash: rh,
        program,
      });
      tx.sign([poster]);
      await sendTx(tx);
    }

    // Verify task account is settled
    const taskIdBytes = taskIdFromUuid(taskIdUuid);
    const [taskAccPda] = taskPda(taskIdBytes);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const taskAcc = await (program.account as any)["taskAccount"].fetch(taskAccPda);
    expect(taskAcc.status).toMatchObject({ settled: {} });
  });

  it("cancel_task_sol: creates then cancels", async () => {
    const poster = Keypair.generate();
    fund(poster.publicKey);

    const taskIdUuid = freshUuid();
    const now = await nowOnChain();
    const deadline = now + 2 * HOUR;

    {
      const rh = await getRecentBlockhash();
      const { tx } = await buildCreateTaskSolTx({
        taskIdUuid,
        mode: "bounty",
        amount: MIN_REWARD,
        deadlineUnix: deadline,
        assignedAgent: null,
        poster: poster.publicKey,
        payer: poster.publicKey,
        recentBlockhash: rh,
        program,
      });
      tx.sign([poster]);
      await sendTx(tx);
    }

    {
      const rh = await getRecentBlockhash();
      const { tx } = await buildCancelTaskSolTx({
        taskIdUuid,
        poster: poster.publicKey,
        payer: poster.publicKey,
        recentBlockhash: rh,
        program,
      });
      tx.sign([poster]);
      await sendTx(tx);
    }

    // Vault should be closed (no lamports)
    const taskIdBytes = taskIdFromUuid(taskIdUuid);
    const [vaultAddr] = vaultPda(taskIdBytes);
    const vaultInfo = await banksClient.getAccount(vaultAddr);
    expect(vaultInfo?.lamports ?? 0).toBe(0);
  });

  it("assign_agent: bounty task can be assigned after creation", async () => {
    const poster = Keypair.generate();
    const agent = Keypair.generate();
    fund(poster.publicKey);
    fund(agent.publicKey);

    await registerAgent(agent.publicKey);

    const taskIdUuid = freshUuid();
    const now = await nowOnChain();

    // Create bounty task
    {
      const rh = await getRecentBlockhash();
      const { tx } = await buildCreateTaskSolTx({
        taskIdUuid,
        mode: "bounty",
        amount: MIN_REWARD,
        deadlineUnix: now + 2 * HOUR,
        assignedAgent: null,
        poster: poster.publicKey,
        payer: poster.publicKey,
        recentBlockhash: rh,
        program,
      });
      tx.sign([poster]);
      await sendTx(tx);
    }

    // Assign agent
    {
      const rh = await getRecentBlockhash();
      const { tx } = await buildAssignAgentTx({
        taskIdUuid,
        poster: poster.publicKey,
        agentWallet: agent.publicKey,
        payer: poster.publicKey,
        recentBlockhash: rh,
        program,
      });
      tx.sign([poster]);
      await sendTx(tx);
    }

    const taskIdBytes = taskIdFromUuid(taskIdUuid);
    const [taskAccPda] = taskPda(taskIdBytes);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const taskAcc = await (program.account as any)["taskAccount"].fetch(taskAccPda);
    expect(taskAcc.status).toMatchObject({ assigned: {} });
    expect(taskAcc.assignedAgent?.toBase58()).toBe(agent.publicKey.toBase58());
  });

  it("open_dispute: submitted task can be disputed by poster", async () => {
    const poster = Keypair.generate();
    const agent = Keypair.generate();
    fund(poster.publicKey);
    fund(agent.publicKey);
    fund(KEEPER_KP.publicKey);

    await registerAgent(agent.publicKey);

    const taskIdUuid = freshUuid();
    const now = await nowOnChain();

    {
      const rh = await getRecentBlockhash();
      const { tx } = await buildCreateTaskSolTx({
        taskIdUuid,
        mode: "direct",
        amount: MIN_REWARD,
        deadlineUnix: now + 2 * HOUR,
        assignedAgent: agent.publicKey,
        poster: poster.publicKey,
        payer: poster.publicKey,
        recentBlockhash: rh,
        program,
      });
      tx.sign([poster]);
      await sendTx(tx);
    }

    {
      const rh = await getRecentBlockhash();
      const { tx } = await buildSubmitDeliverableTx({
        taskIdUuid,
        platformAuthority: KEEPER_KP.publicKey,
        recentBlockhash: rh,
        program,
      });
      tx.sign([KEEPER_KP]);
      await sendTx(tx);
    }

    {
      const rh = await getRecentBlockhash();
      const { tx } = await buildOpenDisputeTx({
        taskIdUuid,
        signer: poster.publicKey,
        payer: poster.publicKey,
        recentBlockhash: rh,
        program,
      });
      tx.sign([poster]);
      await sendTx(tx);
    }

    const taskIdBytes = taskIdFromUuid(taskIdUuid);
    const [taskAccPda] = taskPda(taskIdBytes);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const taskAcc = await (program.account as any)["taskAccount"].fetch(taskAccPda);
    expect(taskAcc.status).toMatchObject({ disputed: {} });
  });

  it("PDA derivation matches program expectation", async () => {
    const wallet = Keypair.generate().publicKey;
    const [pda, bump] = agentPda(wallet);
    expect(bump).toBeGreaterThanOrEqual(0);
    expect(bump).toBeLessThanOrEqual(255);
    // PDA must be off-curve
    expect(PublicKey.isOnCurve(pda.toBytes())).toBe(false);
  });
});
