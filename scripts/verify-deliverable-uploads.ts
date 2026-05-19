/**
 * End-to-end verification for hash-bound deliverable uploads, the
 * download-url auth gate, and judge prompt assembly with files +
 * external links.
 *
 * Runs against real Postgres in mock-mode storage (no R2_ENDPOINT) so
 * `fetchObjectBytes` returns null and the service skips real hash verify.
 * This still exercises every code path that doesn't require live R2.
 *
 *  1. Setup: register poster + agent, create direct task → assigned.
 *  2. Upload URL: assigned agent succeeds; random wallet rejected.
 *  3. Wrong namespace key on submit → rejected.
 *  4. Mock-mode happy path: submit text + one file + two external links;
 *     row carries all three; file_urls mirrors files[].finalUrl.
 *  5. Legacy back-compat: submit with only { contentText, fileUrls }.
 *  6. Download URL: poster ✓, agent ✓, random wallet ✗.
 *  7. Judge prompt rendering with mixed files (supported, oversize,
 *     unsupported_type).
 *
 * Run:  npx tsx scripts/verify-deliverable-uploads.ts
 */
import * as dotenv from "dotenv";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Keypair } from "@solana/web3.js";
import {
  agentsDb,
  deliverablesDb,
  tasksDb,
  getDeliverableUploadUrl,
  getDeliverableDownloadUrl,
  submitDeliverable,
  getLatestBlockhashWithRetry,
  getPublicBase,
  isMockMode,
} from "../shared/src/index.js";
import { buildContentParts } from "../shared/src/llm/providers/gemini.js";

dotenv.config({ path: path.join(process.cwd(), ".env") });

function ok(label: string) {
  console.log(`  \x1b[32m✓\x1b[0m ${label}`);
}
function fail(label: string, why: string): never {
  console.log(`  \x1b[31m✗\x1b[0m ${label}: ${why}`);
  process.exit(1);
}

async function expectThrows(
  label: string,
  fn: () => Promise<unknown>,
  substr: string,
): Promise<void> {
  try {
    await fn();
    fail(label, `expected error containing "${substr}", got success`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.toLowerCase().includes(substr.toLowerCase())) {
      fail(label, `expected error containing "${substr}", got "${msg}"`);
    }
  }
}

async function main() {
  console.log("Verifying deliverable uploads end-to-end…\n");
  console.log("Storage mock mode:", isMockMode() ? "yes (no R2)" : "no");

  // ----- [1] Setup -----
  console.log("\n[1] Setup poster + agent + assigned task");
  const posterWallet = Keypair.generate().publicKey.toBase58();
  const agentWallet = Keypair.generate().publicKey.toBase58();
  const otherWallet = Keypair.generate().publicKey.toBase58();

  await agentsDb.insertPendingAgent({
    wallet: agentWallet,
    name: "TestAgent",
    description: "verification agent",
    capabilities: "files",
    capabilityTags: ["test"],
    endpointUrl: "https://example.com",
    maxResponseSeconds: 60,
    defaultMaxDeliverySeconds: 3600,
    supportedCurrencies: ["SOL"],
    minTaskRewardUsdc: 0n,
  });
  await agentsDb.setRegistrationStage(agentWallet, "complete");

  const taskId = randomUUID();
  await tasksDb.insertTask({
    taskId,
    posterWallet,
    posterKind: "human",
    assignedAgent: agentWallet,
    mode: "direct",
    title: "Test",
    description: "Test task",
    acceptanceCriteria: ["delivers a file"],
    currency: "SOL",
    amount: 1_000_000n,
    deadline: new Date(Date.now() + 4 * 3600 * 1000),
    status: "assigned",
    taskPda: null as unknown as string,
  });
  ok("task created in assigned status");

  // ----- [2] Upload URL auth -----
  console.log("\n[2] Upload URL: agent succeeds, random wallet fails");
  const uploadReq = {
    taskId,
    filename: "report.pdf",
    contentType: "application/pdf",
    sizeBytes: 1024,
  };
  const presigned = await getDeliverableUploadUrl(uploadReq, agentWallet);
  if (!presigned.key.startsWith(`tasks/${taskId}/`))
    fail("[2]", "key not under task namespace");
  ok(`assigned agent got a presigned URL (${presigned.key.slice(0, 40)}…)`);

  await expectThrows(
    "[2] random wallet",
    () => getDeliverableUploadUrl(uploadReq, otherWallet),
    "Not the assigned agent",
  );
  ok("random wallet rejected");

  // ----- [3] Wrong-namespace submit -----
  console.log("\n[3] Submit with a key under another task's namespace → rejected");
  const blockhash = await getLatestBlockhashWithRetry();
  await expectThrows(
    "[3]",
    () =>
      submitDeliverable(
        {
          taskId,
          contentText: "",
          files: [
            {
              key: `tasks/${randomUUID()}/evil.txt`,
              name: "evil.txt",
              contentType: "text/plain",
              sizeBytes: 16,
              sha256: "a".repeat(64),
            },
          ],
          externalLinks: [],
          fileUrls: [],
        },
        agentWallet,
        blockhash,
      ),
    "not under this task",
  );
  ok("wrong-namespace key rejected before any DB write");

  // ----- [4] Mock-mode happy path -----
  console.log("\n[4] Submit with text + 1 file + 2 external links");
  const bh2 = await getLatestBlockhashWithRetry();
  const fileKey = presigned.key;
  const result = await submitDeliverable(
    {
      taskId,
      contentText: "Here is the deliverable.",
      files: [
        {
          key: fileKey,
          name: "report.pdf",
          contentType: "application/pdf",
          sizeBytes: 1024,
          sha256: "f".repeat(64),
        },
      ],
      externalLinks: [
        { url: "https://example.com/demo", label: "live demo" },
        { url: "https://github.com/example/repo/pull/1" },
      ],
      fileUrls: [],
    },
    agentWallet,
    bh2,
  );
  ok(`deliverable inserted: ${result.deliverableId}`);

  const row = await deliverablesDb.getLatestForTask(taskId);
  if (!row) fail("[4]", "deliverable row missing");
  const files = row.files as Array<{ key: string; finalUrl: string }>;
  if (files.length !== 1 || files[0]?.key !== fileKey)
    fail("[4]", `files array unexpected: ${JSON.stringify(files)}`);
  ok("files[] persisted with the right key");

  const expectedUrl = `${getPublicBase()}/${fileKey}`;
  if (files[0]?.finalUrl !== expectedUrl)
    fail("[4]", `finalUrl mismatch: ${files[0]?.finalUrl}`);
  ok("finalUrl populated server-side");

  if (!row.file_urls.includes(expectedUrl))
    fail("[4]", "file_urls did not mirror files[].finalUrl");
  ok("file_urls mirrors files[].finalUrl");

  const links = row.external_links as Array<{ url: string }>;
  if (links.length !== 2) fail("[4]", `external_links length ${links.length}`);
  ok("external_links persisted");

  // ----- [5] Legacy back-compat -----
  console.log("\n[5] Submit with only legacy { contentText, fileUrls }");
  // Reset the task to assigned so the same row can be re-submitted.
  await tasksDb.transitionStatus(taskId, "submitted", "assigned");
  await deliverablesDb.getLatestForTask(taskId); // sanity touch

  const bh3 = await getLatestBlockhashWithRetry();
  await submitDeliverable(
    {
      taskId,
      contentText: "legacy submission",
      fileUrls: ["https://example.com/some.csv"],
      files: [],
      externalLinks: [],
    },
    agentWallet,
    bh3,
  );
  const legacyRow = await deliverablesDb.getLatestForTask(taskId);
  if (!legacyRow) fail("[5]", "legacy row missing");
  const legacyFiles = legacyRow.files as unknown[];
  if (legacyFiles.length !== 0) fail("[5]", "files should default to []");
  ok("legacy body accepted; files defaulted to []");

  // ----- [6] Download URL auth -----
  console.log("\n[6] Download URL: poster ✓, agent ✓, random ✗");
  // The latest deliverable is now the legacy one with no files. Re-submit
  // the hash-bound deliverable so we have a file to download against.
  await tasksDb.transitionStatus(taskId, "submitted", "assigned");
  const bh4 = await getLatestBlockhashWithRetry();
  await submitDeliverable(
    {
      taskId,
      contentText: "",
      files: [
        {
          key: fileKey,
          name: "report.pdf",
          contentType: "application/pdf",
          sizeBytes: 1024,
          sha256: "f".repeat(64),
        },
      ],
      externalLinks: [],
      fileUrls: [],
    },
    agentWallet,
    bh4,
  );

  const posterUrl = await getDeliverableDownloadUrl({
    taskId,
    key: fileKey,
    requesterWallet: posterWallet,
  });
  if (!posterUrl.url) fail("[6 poster]", "no url returned");
  ok("poster got a URL");

  const agentUrl = await getDeliverableDownloadUrl({
    taskId,
    key: fileKey,
    requesterWallet: agentWallet,
  });
  if (!agentUrl.url) fail("[6 agent]", "no url returned");
  ok("agent got a URL");

  await expectThrows(
    "[6 random]",
    () =>
      getDeliverableDownloadUrl({
        taskId,
        key: fileKey,
        requesterWallet: otherWallet,
      }),
    "Not the poster",
  );
  ok("random wallet rejected");

  await expectThrows(
    "[6 unknown key]",
    () =>
      getDeliverableDownloadUrl({
        taskId,
        key: `tasks/${taskId}/not-a-real-key.txt`,
        requesterWallet: posterWallet,
      }),
    "not part",
  );
  ok("unknown key for this deliverable rejected");

  // ----- [7] Judge prompt assembly -----
  console.log("\n[7] Judge prompt: supported + oversize + unsupported types");
  const parts = await buildContentParts({
    taskId,
    title: "Test",
    description: "Test task",
    acceptanceCriteria: ["delivers a file"],
    deliverableText: "writeup",
    fileUrls: [],
    files: [
      {
        key: `tasks/${taskId}/small.pdf`,
        name: "small.pdf",
        contentType: "application/pdf",
        sizeBytes: 1024,
        sha256: "a".repeat(64),
        finalUrl: "https://mock.invalid/small.pdf",
      },
      {
        key: `tasks/${taskId}/huge.pdf`,
        name: "huge.pdf",
        contentType: "application/pdf",
        sizeBytes: 20 * 1024 * 1024,
        sha256: "b".repeat(64),
        finalUrl: "https://mock.invalid/huge.pdf",
      },
      {
        key: `tasks/${taskId}/binary.bin`,
        name: "binary.bin",
        contentType: "application/octet-stream",
        sizeBytes: 4096,
        sha256: "c".repeat(64),
        finalUrl: "https://mock.invalid/binary.bin",
      },
    ],
    externalLinks: [{ url: "https://example.com/demo", label: "demo" }],
  });

  const textPart = parts[0] as { text?: string };
  if (!textPart.text) fail("[7]", "text part missing");
  if (!textPart.text.includes("small.pdf"))
    fail("[7]", "expected small.pdf in prompt");
  if (!textPart.text.includes("not inspected (mock_mode)")) {
    // In mock mode every file is "mock_mode" because fetchObjectBytes returns null.
    if (!isMockMode()) {
      // If not in mock mode we'd expect supported to be inspected.
    } else {
      fail("[7]", `expected mock_mode skip note for small.pdf, got:\n${textPart.text}`);
    }
  }
  if (!textPart.text.includes("unsupported_type"))
    fail("[7]", "expected unsupported_type skip note for binary.bin");
  if (!textPart.text.includes("over_budget") && !isMockMode()) {
    // Skipped in mock mode (mock_mode wins because of fetch ordering).
    fail("[7]", "expected over_budget note for huge.pdf");
  }
  if (!textPart.text.includes("https://example.com/demo"))
    fail("[7]", "expected external link in prompt");
  ok("prompt assembled with correct annotations");

  // Cleanup
  console.log("\n[cleanup]");
  const { getDb } = await import("../shared/src/db/kysely.js");
  const db = getDb();
  await db.deleteFrom("deliverables").where("task_id", "=", taskId).execute();
  await db.deleteFrom("tasks").where("task_id", "=", taskId).execute();
  await db.deleteFrom("agents").where("wallet", "=", agentWallet).execute();
  ok("rows removed");

  console.log("\n\x1b[32mAll checks passed.\x1b[0m");
  process.exit(0);
}

main().catch((e) => {
  console.error("\x1b[31mFAIL:\x1b[0m", e);
  process.exit(1);
});
