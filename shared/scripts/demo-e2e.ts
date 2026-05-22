/**
 * Phase 2 end-to-end demo against devnet + local Postgres.
 *
 * Steps:
 *  1. Reset DB
 *  2. Load keypairs (poster = treasury.json, agent = keeper.json)
 *  3. Pre-register agent → verify wallet signature → complete registration
 *  4. Create direct SOL task (unsigned tx → sign → submit to devnet)
 *  5. Submit deliverable (unsigned tx → sign → submit to devnet)
 *  6. Run judge (mock → PASS)
 *  7. Approve task (unsigned tx → sign → submit to devnet)
 *  8. Print DB state + explorer links
 *
 * NOTE: Settlements are written here by hand as a stand-in for the Phase 3
 * chain listener. In production, the listener observes `approve_sol` on-chain
 * and writes the two settlement rows (release + fee).
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import nacl from "tweetnacl";
import bs58 from "bs58";
import pg from "pg";
import { runner } from "node-pg-migrate";
import {
  Keypair,
  Connection,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

import { preRegisterAgent, completeRegistration } from "../src/services/agent";
import { createDirectTask } from "../src/services/task";
import { submitDeliverable } from "../src/services/deliverable";
import { runJudge } from "../src/services/judge";
import { approveTask } from "../src/services/verification";
import { recordSettlement } from "../src/services/settlement";
import * as tasksDb from "../src/db/tasks";
import * as deliverablesDb from "../src/db/deliverables";
import * as judgeVerdictsDb from "../src/db/judge-verdicts";
import * as settlementsDb from "../src/db/settlements";
import { destroyDb } from "../src/db/index";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EXPLORER = "https://explorer.solana.com/tx";
const CLUSTER = "?cluster=devnet";
const RPC = process.env["SOLANA_RPC_URL"] ?? "https://api.devnet.solana.com";
const DATABASE_URL = process.env["DATABASE_URL"];

function explorerLink(sig: string): string {
  return `${EXPLORER}/${sig}${CLUSTER}`;
}

function loadKeypair(name: string): Keypair {
  const p = resolve(__dirname, "..", "..", "keypairs", name);
  const bytes = JSON.parse(readFileSync(p, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

async function sendAndConfirm(
  connection: Connection,
  tx: VersionedTransaction,
  signers: Keypair[],
): Promise<string> {
  tx.sign(signers);
  const sig = await connection.sendTransaction(tx, { skipPreflight: false });
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  return sig;
}

function step(n: number, msg: string): void {
  console.log(`\n[${n}/8] ${msg}`);
}

function ok(msg: string): void {
  console.log(`  ✓ ${msg}`);
}

async function main(): Promise<void> {
  if (!DATABASE_URL) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  if (process.env["NODE_ENV"] === "production") {
    console.error("demo-e2e refuses to run with NODE_ENV=production");
    process.exit(1);
  }

  // ── Step 1: Reset DB ──────────────────────────────────────────────────────
  step(1, "Reset DB (drop public schema + re-migrate)");
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  try {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await pool.query("GRANT ALL ON SCHEMA public TO public");
  } finally {
    await pool.end();
  }
  await runner({
    databaseUrl: DATABASE_URL,
    dir: resolve(__dirname, "..", "migrations"),
    migrationsTable: "pgmigrations",
    direction: "up",
    count: Infinity,
    verbose: false,
  });
  ok("Schema reset and migrations applied");

  // ── Step 2: Load keypairs ─────────────────────────────────────────────────
  step(2, "Load keypairs (poster = treasury.json, agent = keeper.json)");
  const posterKp = loadKeypair("treasury.json");
  const agentKp = loadKeypair("keeper.json");
  const posterWallet = posterKp.publicKey.toBase58();
  const agentWallet = agentKp.publicKey.toBase58();
  ok(`poster: ${posterWallet}`);
  ok(`agent:  ${agentWallet}`);

  const connection = new Connection(RPC, "confirmed");
  const [posterBal, agentBal] = await Promise.all([
    connection.getBalance(posterKp.publicKey),
    connection.getBalance(agentKp.publicKey),
  ]);
  ok(`poster balance: ${(posterBal / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  ok(`agent  balance: ${(agentBal / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

  if (posterBal < 0.05 * LAMPORTS_PER_SOL || agentBal < 0.05 * LAMPORTS_PER_SOL) {
    console.warn("  ⚠  Low balance — transactions may fail. Top up devnet wallets.");
  }

  // ── Step 3: Agent registration ────────────────────────────────────────────
  step(3, "Pre-register agent → verify signature → complete registration");

  const { sessionToken, nonce } = await preRegisterAgent({
    wallet: agentWallet,
    name: "Demo Agent",
    description: "Phase 2 demo agent powered by Basira",
    capabilities: "general-purpose task execution",
    capabilityTags: ["demo", "general"],
    endpointUrl: "https://example.com/demo-agent",
    maxResponseSeconds: 60,
    defaultMaxDeliverySeconds: 3_600,
    supportedCurrencies: ["SOL"],
    minTaskRewardUsdc: 0n,
  });
  ok("Agent row inserted, session issued");

  // Sign the registration nonce in-process (simulates agent's wallet signing)
  const regMsg = new TextEncoder().encode(`Sign in to Basira: ${nonce}`);
  const regSig = bs58.encode(nacl.sign.detached(regMsg, agentKp.secretKey));

  const { verifyWalletSignature } = await import("../src/services/agent.js");
  await verifyWalletSignature({
    sessionToken,
    signature: regSig,
    publicKey: agentWallet,
  });
  ok("Wallet signature verified → stage: wallet_verified");

  // Register on-chain — keeper-signed (idempotent; no-op if already exists).
  const { registerAgentOnChain } = await import("../src/services/agent.js");
  const reg = await registerAgentOnChain(agentKp.publicKey.toBase58());
  ok(
    reg.alreadyRegistered
      ? `register_agent on-chain: already registered (skipping)`
      : `register_agent on-chain: ${explorerLink(reg.txSignature!)}`,
  );

  const { apiKey } = await completeRegistration({ sessionToken });
  ok(`Registration complete. API key (prefix): ${apiKey.slice(0, 12)}...`);

  // ── Step 4: Create direct SOL task ────────────────────────────────────────
  step(4, "Create direct SOL task");
  const { blockhash: rh2 } = await connection.getLatestBlockhash();
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 2 * 3_600);

  const { unsignedTx: createTx, taskId } = await createDirectTask(
    {
      mode: "direct",
      currency: "SOL",
      amount: 10_000_000n,
      deadline,
      assignedAgent: agentWallet,
      title: "Phase 2 Demo Task",
      description: "Build and demo the Basira shared library.",
      acceptanceCriteria: ["PASS_ME: library exports work", "demo script exits 0"],
    },
    posterWallet,
    rh2,
  );
  const createSig = await sendAndConfirm(connection, createTx, [posterKp]);
  ok(`taskId: ${taskId}`);
  ok(`create_task_sol on-chain: ${explorerLink(createSig)}`);

  const taskRow = await tasksDb.getTaskById(taskId);
  ok(`DB status: ${taskRow?.status}`);

  // ── Step 5: Submit deliverable ────────────────────────────────────────────
  step(5, "Submit deliverable");
  const { blockhash: rh3 } = await connection.getLatestBlockhash();
  const { unsignedTx: submitTx, deliverableId } = await submitDeliverable(
    {
      taskId,
      contentText: "PASS_ME: All library exports verified. Demo script ran successfully.",
      fileUrls: [],
    },
    agentWallet,
    rh3,
  );
  const submitSig = await sendAndConfirm(connection, submitTx, [agentKp]);
  ok(`deliverableId: ${deliverableId}`);
  ok(`submit_deliverable on-chain: ${explorerLink(submitSig)}`);

  await deliverablesDb.confirmDeliverable(deliverableId);
  ok("Deliverable confirmed in DB");

  // Flip task to submitted (listener responsibility in Phase 3)
  await tasksDb.setTaskStatus(taskId, "submitted");
  ok("Task status → submitted");

  // ── Step 6: Run judge ─────────────────────────────────────────────────────
  step(6, "Run judge (mock provider)");
  const verdict = await runJudge(taskId);
  ok(`Verdict: ${verdict.verdict} (confidence: ${verdict.confidence})`);
  ok(`Reasoning: ${verdict.reasoning}`);
  ok(`Prompt version: ${verdict.promptVersion}`);

  // ── Step 7: Approve task ──────────────────────────────────────────────────
  step(7, "Approve task");
  const { blockhash: rh4 } = await connection.getLatestBlockhash();
  const { unsignedTx: approveTx } = await approveTask(taskId, posterWallet, rh4);
  const approveSig = await sendAndConfirm(connection, approveTx, [posterKp]);
  ok(`approve_sol on-chain: ${explorerLink(approveSig)}`);

  // Stand-in for Phase 3 listener: write settlement rows
  await recordSettlement({
    taskId,
    kind: "release",
    recipientWallet: agentWallet,
    currency: "SOL",
    amount: 9_500_000n,
    txSignature: approveSig,
  });
  await recordSettlement({
    taskId,
    kind: "fee",
    recipientWallet: "Bddo2ek21cs8SmArWa7c3GTu8VQnAiKzs7fc1T3AF2hc",
    currency: "SOL",
    amount: 500_000n,
    txSignature: approveSig,
  });
  ok("Settlement rows written (2 rows: release + fee)");

  // ── Step 8: Print final DB state ──────────────────────────────────────────
  step(8, "Final DB state");
  const finalTask = await tasksDb.getTaskById(taskId);
  const finalVerdict = await judgeVerdictsDb.getLatestVerdictForTask(taskId);
  const finalSettlements = await settlementsDb.listSettlementsForTask(taskId);

  console.log("\n  ── Task ──");
  console.log(`    id:     ${finalTask?.task_id}`);
  console.log(`    status: ${finalTask?.status}`);
  console.log(`    amount: ${finalTask?.amount} lamports`);

  console.log("\n  ── Judge verdict ──");
  console.log(`    verdict:    ${finalVerdict?.verdict}`);
  console.log(`    confidence: ${finalVerdict?.confidence}`);
  console.log(`    model:      ${finalVerdict?.model}`);

  console.log("\n  ── Settlements ──");
  for (const s of finalSettlements) {
    console.log(`    ${s.kind}: ${s.amount} ${s.currency} → ${s.recipientWallet.slice(0, 12)}…`);
  }

  console.log("\n  ── Explorer links ──");
  console.log(`    register:   ${explorerLink(registerSig)}`);
  console.log(`    create:     ${explorerLink(createSig)}`);
  console.log(`    submit:     ${explorerLink(submitSig)}`);
  console.log(`    approve:    ${explorerLink(approveSig)}`);

  await destroyDb();
  console.log("\n✅  Phase 2 demo complete — all 8 steps passed.\n");
}

main().catch((err) => {
  console.error("\n❌  Demo failed:", err);
  destroyDb().finally(() => process.exit(1));
});
