/**
 * End-to-end verification for the typed-inputs feature.
 *
 * Exercises the same code paths the API routes use, against the real Postgres
 * and a fresh devnet-airdrop-free flow (only one on-chain hop needed: the
 * register-agent + create-task PDAs require funded wallets; we reuse the
 * already-funded agent.json and seed a fresh poster from it).
 *
 *  1. Register a fresh agent (DB only — no on-chain step) with an inputSchema.
 *  2. Fetch its declared schema via the same helper the GET route uses.
 *  3. Attempt to create a direct task without typedInputs        → expect failure.
 *  4. Attempt to create a direct task with invalid typedInputs   → expect failure.
 *  5. Create a direct task with valid typedInputs                → expect success,
 *     task row carries typed_inputs + input_schema_snapshot.
 *
 * Run:  npx tsx scripts/verify-typed-inputs.ts
 */
import * as dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  agentsDb,
  tasksDb,
  createDirectTask,
  getConnection,
  getLatestBlockhashWithRetry,
  TypedInputsValidationError,
} from "../shared/src/index.js";

dotenv.config({ path: path.join(process.cwd(), ".env") });

function ok(label: string) {
  console.log(`  \x1b[32m✓\x1b[0m ${label}`);
}
function fail(label: string, why: string): never {
  console.log(`  \x1b[31m✗\x1b[0m ${label}: ${why}`);
  process.exit(1);
}

async function main() {
  console.log("Verifying typed-inputs end-to-end…\n");

  // ----- Setup: fresh agent + funded poster -----
  const posterSecret = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "keypairs", "agent.json"), "utf-8"),
  );
  const poster = Keypair.fromSecretKey(new Uint8Array(posterSecret));
  const c = getConnection();
  const pBal = await c.getBalance(poster.publicKey);
  console.log("Poster:", poster.publicKey.toBase58(), "balance:", pBal / 1e9, "SOL");
  if (pBal < 0.05e9) fail("setup", "poster has too little SOL");

  const freshAgent = Keypair.generate().publicKey.toBase58();
  console.log("Fresh agent wallet (DB-only):", freshAgent);

  const inputSchema = {
    type: "object",
    required: ["url"],
    properties: {
      url: { type: "string", format: "uri" },
      maxPages: { type: "integer", minimum: 1, maximum: 50 },
    },
  };
  const outputSchema = {
    type: "object",
    required: ["csvUrl"],
    properties: { csvUrl: { type: "string" }, rowCount: { type: "integer" } },
  };

  // ----- [1] Register agent with schema -----
  console.log("\n[1] Register agent row with input/output schemas");
  await agentsDb.insertPendingAgent({
    wallet: freshAgent,
    name: "ScrapeBot Test",
    description: "Verification agent",
    capabilities: "url scraping",
    capabilityTags: ["scrape"],
    endpointUrl: "https://example.com",
    commsModes: ["polling"],
    maxResponseSeconds: 60,
    defaultMaxDeliverySeconds: 3600,
    supportedCurrencies: ["SOL"],
    minTaskRewardUsdc: 0n,
    inputSchema,
    outputSchema,
  });
  await agentsDb.setRegistrationStage(freshAgent, "complete");
  const stored = await agentsDb.getAgentByWallet(freshAgent);
  if (!stored) fail("[1]", "agent row missing");
  if (!stored.input_schema || !stored.output_schema)
    fail("[1]", "schemas not persisted");
  ok("agent registered with both schemas");

  // ----- [2] Schema GET helper round-trip -----
  console.log("\n[2] Fetch schema (mirroring GET /agents/[wallet]/schema)");
  const fetched = await agentsDb.getAgentByWallet(freshAgent);
  if (!fetched) fail("[2]", "agent disappeared");
  const fetchedInputSchema = fetched.input_schema as { type?: string };
  if (fetchedInputSchema?.type !== "object")
    fail("[2]", "input_schema not round-trippable");
  ok("schema retrievable");

  // ----- [3] Create direct task without typedInputs → must fail -----
  console.log("\n[3] createDirectTask without typedInputs → expect rejection");
  const blockhash = await getLatestBlockhashWithRetry();
  const baseTask = {
    mode: "direct" as const,
    currency: "SOL" as const,
    title: "Scrape this site",
    description: "Test task",
    acceptanceCriteria: ["valid csv returned"],
    amount: 1_000_000n, // 0.001 SOL
    deadline: BigInt(Math.floor(Date.now() / 1000) + 4 * 3600),
    assignedAgent: freshAgent,
  };

  try {
    await createDirectTask(baseTask, poster.publicKey.toBase58(), blockhash);
    fail("[3]", "expected error, got success");
  } catch (e) {
    if (e instanceof Error && e.message.includes("typedInputs is required")) {
      ok("rejected with 'typedInputs is required'");
    } else {
      fail("[3]", `unexpected error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ----- [4] Invalid typedInputs (wrong type) → must fail -----
  console.log("\n[4] createDirectTask with invalid typedInputs → expect rejection");
  try {
    await createDirectTask(
      { ...baseTask, typedInputs: { url: 123, maxPages: 5 } }, // url must be string
      poster.publicKey.toBase58(),
      blockhash,
    );
    fail("[4]", "expected error, got success");
  } catch (e) {
    if (e instanceof TypedInputsValidationError) {
      ok(`rejected with TypedInputsValidationError (${e.errors.length} issues)`);
    } else if (
      e instanceof Error &&
      e.message.toLowerCase().includes("typed inputs")
    ) {
      ok("rejected with typed-inputs validation");
    } else {
      fail("[4]", `unexpected error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ----- [5] Valid typedInputs → success, persisted on row -----
  console.log("\n[5] createDirectTask with valid typedInputs → expect success");
  const validInputs = { url: "https://example.com/data", maxPages: 7 };
  const blockhash5 = await getLatestBlockhashWithRetry();
  const result = await createDirectTask(
    { ...baseTask, typedInputs: validInputs },
    poster.publicKey.toBase58(),
    blockhash5,
  );
  ok(`task created: ${result.taskId}`);

  const row = await tasksDb.getTaskById(result.taskId);
  if (!row) fail("[5]", "task row missing");
  const persistedInputs = row.typed_inputs as Record<string, unknown> | null;
  if (!persistedInputs || persistedInputs.url !== validInputs.url) {
    fail("[5]", `typed_inputs not persisted: ${JSON.stringify(persistedInputs)}`);
  }
  ok("typed_inputs persisted on task row");

  const snapshot = row.input_schema_snapshot as { type?: string } | null;
  if (!snapshot || snapshot.type !== "object")
    fail("[5]", "input_schema_snapshot missing");
  ok("input_schema_snapshot frozen on task row");

  // ----- [6] Validate snapshot is decoupled from agent's current schema -----
  console.log("\n[6] Update agent schema, confirm snapshot unchanged");
  const newSchema = { type: "object", properties: { totallyDifferent: { type: "string" } } };
  await agentsDb.setAgentSchemas(freshAgent, newSchema, null);
  const after = await tasksDb.getTaskById(result.taskId);
  const snap2 = after?.input_schema_snapshot as { properties?: Record<string, unknown> };
  if (!snap2 || !snap2.properties || !snap2.properties.url) {
    fail("[6]", "snapshot got mutated when agent schema changed");
  }
  ok("snapshot is stable — task still references the schema it was created against");

  console.log("\n\x1b[32mAll checks passed.\x1b[0m");

  // Best-effort cleanup so re-runs don't leak rows
  try {
    await import("../shared/src/db/kysely.js").then(async (m) => {
      const db = m.getDb();
      await db.deleteFrom("tasks").where("task_id", "=", result.taskId).execute();
      await db.deleteFrom("agents").where("wallet", "=", freshAgent).execute();
    });
  } catch {
    // ignore
  }
  void PublicKey; // satisfy unused-import linter
  process.exit(0);
}

main().catch((e) => {
  console.error("\x1b[31mFAIL:\x1b[0m", e);
  process.exit(1);
});
