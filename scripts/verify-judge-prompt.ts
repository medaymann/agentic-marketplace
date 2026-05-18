/**
 * DB-free smoke test for the new judge prompt assembly. Confirms that
 * buildContentParts:
 *  - inlines no bytes in mock mode (fetchObjectBytes returns null).
 *  - annotates each file with the right skip reason.
 *  - includes external links in the text prompt.
 *  - falls back to legacy `fileUrls` rendering when `files` is empty.
 *
 * Run:  npx tsx scripts/verify-judge-prompt.ts
 */
import { buildContentParts } from "../shared/src/llm/providers/gemini.js";

function ok(label: string) {
  console.log(`  \x1b[32m✓\x1b[0m ${label}`);
}
function fail(label: string, why: string): never {
  console.log(`  \x1b[31m✗\x1b[0m ${label}: ${why}`);
  process.exit(1);
}

async function main() {
  console.log("Verifying judge prompt assembly (mock mode)…\n");

  // ----- [1] Files + external links -----
  console.log("[1] Mixed files + external links");
  const parts = await buildContentParts({
    taskId: "test",
    title: "Test task",
    description: "verify",
    acceptanceCriteria: ["delivers something"],
    deliverableText: "the writeup",
    fileUrls: [],
    files: [
      {
        key: "tasks/x/small.pdf",
        name: "small.pdf",
        contentType: "application/pdf",
        sizeBytes: 1024,
        sha256: "a".repeat(64),
        finalUrl: "https://mock.invalid/small.pdf",
      },
      {
        key: "tasks/x/huge.pdf",
        name: "huge.pdf",
        contentType: "application/pdf",
        sizeBytes: 20 * 1024 * 1024,
        sha256: "b".repeat(64),
        finalUrl: "https://mock.invalid/huge.pdf",
      },
      {
        key: "tasks/x/binary.bin",
        name: "binary.bin",
        contentType: "application/octet-stream",
        sizeBytes: 4096,
        sha256: "c".repeat(64),
        finalUrl: "https://mock.invalid/binary.bin",
      },
    ],
    externalLinks: [{ url: "https://example.com/demo", label: "live demo" }],
  });

  if (parts.length !== 1) fail("[1]", `expected 1 part (text only in mock mode), got ${parts.length}`);
  ok("only the text part is returned in mock mode (no inlineData)");

  const text = (parts[0] as { text: string }).text;
  if (!text.includes("small.pdf")) fail("[1]", "small.pdf not in prompt");
  if (!text.includes("huge.pdf")) fail("[1]", "huge.pdf not in prompt");
  if (!text.includes("binary.bin")) fail("[1]", "binary.bin not in prompt");
  ok("all three files appear in the attachments section");

  // unsupported_type fires before mock_mode (we check the mime type first).
  if (!text.includes("not inspected (unsupported_type)"))
    fail("[1]", "expected unsupported_type for binary.bin");
  ok("unsupported_type annotation present for binary.bin");

  // Either over_budget (if the supported file would have fit and the huge
  // one wouldn't) or mock_mode (because fetch returned null). The 20 MB
  // huge.pdf exceeds the 10 MB INLINE_BUDGET_BYTES so it gets over_budget.
  if (!text.includes("not inspected (over_budget)"))
    fail("[1]", "expected over_budget for huge.pdf");
  ok("over_budget annotation present for huge.pdf");

  // small.pdf is in budget and supported, but in mock mode fetch returns null.
  if (!text.includes("not inspected (mock_mode)"))
    fail("[1]", "expected mock_mode for small.pdf");
  ok("mock_mode annotation present for small.pdf");

  if (!text.includes("https://example.com/demo"))
    fail("[1]", "external link not in prompt");
  if (!text.includes("live demo"))
    fail("[1]", "external link label not in prompt");
  ok("external links rendered with label");

  // ----- [2] Legacy fileUrls only -----
  console.log("\n[2] Legacy fileUrls fallback");
  const parts2 = await buildContentParts({
    taskId: "test",
    title: "Test",
    description: "x",
    acceptanceCriteria: ["x"],
    deliverableText: "x",
    fileUrls: ["https://example.com/legacy.csv"],
  });
  const text2 = (parts2[0] as { text: string }).text;
  if (!text2.includes("Legacy file URLs"))
    fail("[2]", "expected 'Legacy file URLs' header");
  if (!text2.includes("legacy.csv"))
    fail("[2]", "legacy URL missing from prompt");
  ok("legacy fileUrls render via fallback section");

  // ----- [3] No attachments -----
  console.log("\n[3] No attachments at all");
  const parts3 = await buildContentParts({
    taskId: "test",
    title: "Test",
    description: "x",
    acceptanceCriteria: ["x"],
    deliverableText: "x",
    fileUrls: [],
  });
  const text3 = (parts3[0] as { text: string }).text;
  if (text3.includes("Attachments"))
    fail("[3]", "should not have Attachments section");
  ok("no Attachments section when there's nothing to attach");

  console.log("\n\x1b[32mAll checks passed.\x1b[0m");
  process.exit(0);
}

main().catch((e) => {
  console.error("\x1b[31mFAIL:\x1b[0m", e);
  process.exit(1);
});
