/**
 * Phase 3 end-to-end demo against devnet + local Postgres.
 *
 * Spawns the daemon as a child process and drives a full task lifecycle from a
 * sibling script. The daemon's chain listener is the only writer of settlement
 * rows and terminal task transitions; the script only:
 *   - resets DB
 *   - registers an agent (writes pending row, lands register_agent on devnet)
 *   - creates a direct SOL task (writes pending row, lands create_task_sol)
 *   - submits a deliverable (writes pending row, lands submit_deliverable)
 *   - approves the task (lands approve_sol)
 *   - waits for the daemon to reconcile each event, polling DB
 *   - sends SIGTERM to the daemon and asserts exit 0 within 30s
 */

import { spawn, type ChildProcess } from "node:child_process";
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
} from "@solana/web3.js";

import { preRegisterAgent, completeRegistration } from "@basira/shared";
import { createDirectTask } from "@basira/shared";
import { submitDeliverable } from "@basira/shared";
import { approveTask } from "@basira/shared";
import { tasksDb, settlementsDb, daemonStateDb } from "@basira/shared";
import { destroyDb } from "@basira/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const RPC = process.env["SOLANA_RPC_URL"] ?? "https://api.devnet.solana.com";
const DATABASE_URL = process.env["DATABASE_URL"]!;
const HEALTH_PORT = process.env["HEALTH_PORT"] ?? "8088";

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
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  return sig;
}

async function resetDb(): Promise<void> {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await pool.end();
  await runner({
    databaseUrl: DATABASE_URL,
    dir: resolve(__dirname, "..", "..", "shared", "migrations"),
    migrationsTable: "pgmigrations",
    direction: "up",
    log: () => {},
  });
}

function step(n: number, msg: string): void {
  console.log(`\n[${n}] ${msg}`);
}
function ok(msg: string): void {
  console.log(`  ✓ ${msg}`);
}

async function pollUntil<T>(
  fn: () => Promise<T | null | undefined>,
  description: string,
  timeoutMs = 60_000,
  intervalMs = 1_500,
): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await fn();
    if (result) return result;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out waiting for: ${description}`);
}

function spawnDaemon(): ChildProcess {
  const child = spawn(
    resolve(__dirname, "..", "..", "node_modules", ".bin", "tsx"),
    [resolve(__dirname, "..", "src", "index.ts")],
    {
      env: {
        ...process.env,
        DATABASE_URL,
        HEALTH_PORT,
      },
      stdio: ["ignore", "inherit", "inherit"],
    },
  );
  return child;
}

async function waitForHealth(timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${HEALTH_PORT}/health`);
      if (res.ok) return;
    } catch {
      // not ready
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Daemon /health did not come up in time");
}

async function main(): Promise<void> {
  if (!DATABASE_URL) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  step(1, "Reset DB");
  await resetDb();
  // Set cursor to a recent slot so gap-fill doesn't replay all of history.
  // Use current chain head as the starting point; only events after we boot
  // matter for this e2e.
  const tmpConn = new Connection(RPC, "confirmed");
  const slotNow = await tmpConn.getSlot("confirmed");
  await daemonStateDb.setLastSeenSlot(BigInt(slotNow));
  ok(`Schema reset; cursor advanced to current slot ${slotNow}`);

  step(2, "Load keypairs (poster = treasury.json, agent = keeper.json)");
  const posterKp = loadKeypair("treasury.json");
  const agentKp = loadKeypair("keeper.json");
  const posterWallet = posterKp.publicKey.toBase58();
  const agentWallet = agentKp.publicKey.toBase58();
  ok(`poster: ${posterWallet}`);
  ok(`agent:  ${agentWallet}`);
  const connection = new Connection(RPC, "confirmed");

  step(3, "Spawn daemon as child process; wait for /health");
  const daemon = spawnDaemon();
  daemon.on("error", (err) => console.error("daemon child error:", err));
  await waitForHealth();
  ok("daemon /health responded OK");

  step(4, "Pre-register agent + verify wallet signature + register on-chain");
  // Need DB access in this script too. Note: shared's getDb() is a separate
  // pool from the daemon's, but that's fine — both connect to the same DB.
  const { sessionToken, nonce } = await preRegisterAgent({
    wallet: agentWallet,
    name: "Demo Agent",
    description: "Phase 3 e2e agent",
    capabilities: "general-purpose",
    capabilityTags: ["demo"],
    endpointUrl: "https://example.invalid",
    maxResponseSeconds: 60,
    defaultMaxDeliverySeconds: 3_600,
    supportedCurrencies: ["SOL"],
    minTaskRewardUsdc: 0n,
  });
  const regMsg = new TextEncoder().encode(`Sign in to Basira: ${nonce}`);
  const regSig = bs58.encode(nacl.sign.detached(regMsg, agentKp.secretKey));
  const { verifyWalletSignature } = await import("@basira/shared");
  await verifyWalletSignature({
    sessionToken,
    signature: regSig,
    publicKey: agentWallet,
  });

  // Register on-chain — keeper-signed (idempotent; no-op if already exists).
  const { registerAgentOnChain } = await import("@basira/shared");
  const reg = await registerAgentOnChain(agentWallet);
  ok(
    reg.alreadyRegistered
      ? "agent already registered on-chain (skipping)"
      : "register_agent landed on devnet (keeper-signed)",
  );
  await completeRegistration({ sessionToken });
  ok("registration complete in DB");

  step(5, "Create direct SOL task");
  const { blockhash: rh2 } = await connection.getLatestBlockhash();
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 2 * 3_600);
  const { unsignedTx: createTx, taskId } = await createDirectTask(
    {
      mode: "direct",
      currency: "SOL",
      amount: 10_000_000n,
      deadline,
      assignedAgent: agentWallet,
      title: "Phase 3 Demo Task",
      description: "End-to-end daemon test.",
      acceptanceCriteria: ["PASS_ME: listener reconciles", "demo exits 0"],
    },
    posterWallet,
    rh2,
  );
  await sendAndConfirm(connection, createTx, [posterKp]);
  ok(`taskId: ${taskId}`);
  // Listener writes nothing for create_task (service inserted the row already).
  // We just verify the row exists in the expected status.
  const created = await tasksDb.getTaskById(taskId);
  if (!created || created.status !== "assigned") {
    throw new Error(`create-task did not produce expected DB row: ${created?.status}`);
  }
  ok("task row in DB at status=assigned");

  step(6, "Submit deliverable → wait for listener to flip task → submitted");
  const { blockhash: rh3 } = await connection.getLatestBlockhash();
  const { unsignedTx: submitTx } = await submitDeliverable(
    {
      taskId,
      contentText: "PASS_ME: deliverable demonstrating Phase 3 reconciliation",
      fileUrls: [],
    },
    agentWallet,
    rh3,
  );
  await sendAndConfirm(connection, submitTx, [agentKp]);
  await pollUntil(
    async () => {
      const t = await tasksDb.getTaskById(taskId);
      return t?.status === "submitted" ? t : null;
    },
    "task → submitted",
  );
  ok("listener flipped task to submitted");

  step(7, "Approve task → wait for listener to write release + fee settlements");
  const { blockhash: rh4 } = await connection.getLatestBlockhash();
  const { unsignedTx: approveTx } = await approveTask(taskId, posterWallet, rh4);
  await sendAndConfirm(connection, approveTx, [posterKp]);
  const settlements = await pollUntil(
    async () => {
      const rows = await settlementsDb.listSettlementsForTask(taskId);
      return rows.length === 2 ? rows : null;
    },
    "2 settlement rows",
    60_000,
  );
  ok(`settlements written by listener: ${settlements.length}`);
  const release = settlements.find((s) => s.kind === "release");
  const fee = settlements.find((s) => s.kind === "fee");
  ok(`release ${release?.amount} → ${release?.recipientWallet.slice(0, 12)}…`);
  ok(`fee     ${fee?.amount} → ${fee?.recipientWallet.slice(0, 12)}…`);
  const finalTask = await tasksDb.getTaskById(taskId);
  if (finalTask?.status !== "settled") {
    throw new Error(`Expected task settled, got ${finalTask?.status}`);
  }
  ok(`task → ${finalTask.status}`);

  step(8, "SIGTERM the daemon and assert exit 0");
  daemon.kill("SIGTERM");
  const exitCode = await new Promise<number>((resolve) => {
    daemon.on("exit", (code) => resolve(code ?? 0));
    setTimeout(() => resolve(124), 30_000);
  });
  if (exitCode !== 0) {
    throw new Error(`daemon exited with ${exitCode}`);
  }
  ok("daemon exited cleanly");

  await destroyDb();
  console.log("\n✅  Phase 3 daemon e2e — all steps passed.\n");
}

main().catch((err) => {
  console.error("\n❌  daemon-e2e failed:", err);
  process.exit(1);
});
