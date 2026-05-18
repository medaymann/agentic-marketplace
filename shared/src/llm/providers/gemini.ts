import type { JudgeInput, JudgeProvider, Verdict } from "../types";
import { JUDGE_PROMPT_V1, JUDGE_PROMPT_VERSION } from "../prompt";
import { judgeOutputSchema } from "../../schemas/judge";
import { fetchObjectBytes } from "../../storage/fetch";
import type { DeliverableFile } from "../../storage/types";

const DEFAULT_MODEL = "gemini-2.5-flash";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Total budget for file bytes shipped into a single Gemini call. Files past
// this are mentioned in the text prompt with a skip note but their bytes are
// not inlined.
const INLINE_BUDGET_BYTES = 10 * 1024 * 1024;

type SkipReason =
  | "mock_mode"
  | "unsupported_type"
  | "over_budget"
  | "fetch_failed";

interface InlinePart {
  inlineData: { mimeType: string; data: string };
}
interface TextPart {
  text: string;
}
type GeminiPart = TextPart | InlinePart;

function isSupportedMime(contentType: string): boolean {
  return (
    contentType === "application/pdf" ||
    contentType.startsWith("image/") ||
    contentType.startsWith("audio/") ||
    contentType.startsWith("text/")
  );
}

function shortHash(sha256: string): string {
  return sha256.slice(0, 12);
}

interface AssemblyResult {
  parts: GeminiPart[];
  skipNotes: Array<{ file: DeliverableFile; reason: SkipReason }>;
}

/**
 * Walks the deliverable's files, attempting to stream each one into the
 * Gemini request as an `inlineData` part. Tracks a running byte budget and
 * records a skip reason for any file we couldn't or shouldn't inline. The
 * caller uses both the returned `parts` (without the text part, which it
 * prepends) and `skipNotes` (to annotate the text prompt).
 */
async function fetchFilePartsAndNotes(
  files: DeliverableFile[],
): Promise<AssemblyResult> {
  const parts: GeminiPart[] = [];
  const skipNotes: AssemblyResult["skipNotes"] = [];
  let totalInlinedBytes = 0;

  for (const file of files) {
    if (!isSupportedMime(file.contentType)) {
      skipNotes.push({ file, reason: "unsupported_type" });
      continue;
    }
    if (totalInlinedBytes + file.sizeBytes > INLINE_BUDGET_BYTES) {
      skipNotes.push({ file, reason: "over_budget" });
      continue;
    }
    let fetched;
    try {
      fetched = await fetchObjectBytes(file.key);
    } catch (err) {
      console.warn(
        `[judge] fetchObjectBytes failed for ${file.key}:`,
        err instanceof Error ? err.message : err,
      );
      skipNotes.push({ file, reason: "fetch_failed" });
      continue;
    }
    if (!fetched) {
      // Mock mode — bytes aren't available, judge against metadata only.
      skipNotes.push({ file, reason: "mock_mode" });
      continue;
    }
    parts.push({
      inlineData: {
        mimeType: file.contentType,
        data: fetched.bytes.toString("base64"),
      },
    });
    totalInlinedBytes += fetched.sizeBytes;
  }

  return { parts, skipNotes };
}

function renderAttachmentsSection(
  input: JudgeInput,
  skipNotes: AssemblyResult["skipNotes"],
): string {
  const files = input.files ?? [];
  const links = input.externalLinks ?? [];
  if (files.length === 0 && links.length === 0 && input.fileUrls.length === 0) {
    return "";
  }
  const lines: string[] = ["## Attachments"];

  if (files.length > 0) {
    const skipByKey = new Map(skipNotes.map((s) => [s.file.key, s.reason]));
    lines.push("Files (hash-bound, attached for review):");
    for (const f of files) {
      const reason = skipByKey.get(f.key);
      const annotation = reason ? ` — not inspected (${reason})` : "";
      lines.push(
        `- ${f.name} (${f.sizeBytes} bytes, ${f.contentType}, sha256: ${shortHash(f.sha256)})${annotation}`,
      );
    }
  }

  if (links.length > 0) {
    lines.push("");
    lines.push("External links (advisory; not fetched by the judge):");
    for (const l of links) {
      lines.push(l.label ? `- ${l.url} — ${l.label}` : `- ${l.url}`);
    }
  }

  // Legacy fallback: if we got here with no `files` but some `fileUrls`, list
  // them so old callers still surface something.
  if (files.length === 0 && input.fileUrls.length > 0) {
    lines.push("");
    lines.push("Legacy file URLs:");
    for (const u of input.fileUrls) lines.push(`- ${u}`);
  }

  return lines.join("\n");
}

function renderTextPrompt(
  input: JudgeInput,
  skipNotes: AssemblyResult["skipNotes"],
): string {
  const criteriaList = input.acceptanceCriteria
    .map((c, i) => `${i + 1}. ${c}`)
    .join("\n");
  return JUDGE_PROMPT_V1.replace("{{title}}", input.title)
    .replace("{{description}}", input.description)
    .replace("{{acceptance_criteria}}", criteriaList)
    .replace("{{deliverable_text}}", input.deliverableText)
    .replace("{{attachments_section}}", renderAttachmentsSection(input, skipNotes));
}

/**
 * Exported for tests / verify scripts so the rendering can be exercised
 * without a real Gemini call. Returns the assembled Gemini `parts` array.
 */
export async function buildContentParts(input: JudgeInput): Promise<GeminiPart[]> {
  const { parts: fileParts, skipNotes } = await fetchFilePartsAndNotes(
    input.files ?? [],
  );
  const text = renderTextPrompt(input, skipNotes);
  return [{ text }, ...fileParts];
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: { message?: string };
}

export class GeminiJudgeProvider implements JudgeProvider {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(opts?: { apiKey?: string; model?: string }) {
    const apiKey = opts?.apiKey ?? process.env["LLM_API_KEY"];
    if (!apiKey) {
      throw new Error("GeminiJudgeProvider: LLM_API_KEY is required");
    }
    this.apiKey = apiKey;
    this.model = opts?.model ?? DEFAULT_MODEL;
  }

  async evaluate(input: JudgeInput): Promise<Verdict> {
    const parts = await buildContentParts(input);
    const url = `${API_BASE}/${this.model}:generateContent?key=${this.apiKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`GeminiJudgeProvider: HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }

    const json = (await res.json()) as GeminiResponse;
    if (json.error) {
      throw new Error(`GeminiJudgeProvider: ${json.error.message ?? "unknown error"}`);
    }

    const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (!text) {
      throw new Error("GeminiJudgeProvider: empty response");
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new Error(
        `GeminiJudgeProvider: response was not valid JSON: ${text.slice(0, 200)}`,
        { cause: err },
      );
    }
    const validated = judgeOutputSchema.parse(parsed);
    return {
      verdict: validated.verdict,
      confidence: validated.confidence,
      reasoning: validated.reasoning,
      failedCriteria: validated.failedCriteria,
      model: this.model,
      promptVersion: JUDGE_PROMPT_VERSION,
    };
  }
}
