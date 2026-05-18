import type { JudgeInput, JudgeProvider, Verdict } from "../types";
import { JUDGE_PROMPT_V1, JUDGE_PROMPT_VERSION } from "../prompt";
import { judgeOutputSchema } from "../../schemas/judge";

const DEFAULT_MODEL = "llama-3.3-70b-versatile";
const API_BASE = "https://api.groq.com/openai/v1/chat/completions";

function shortHash(sha256: string): string {
  return sha256.slice(0, 12);
}

function renderAttachmentsSection(input: JudgeInput): string {
  const files = input.files ?? [];
  const links = input.externalLinks ?? [];
  if (files.length === 0 && links.length === 0 && input.fileUrls.length === 0) {
    return "";
  }
  const lines: string[] = ["## Attachments"];

  if (files.length > 0) {
    lines.push("Files (hash-bound; bytes not available to this judge):");
    for (const f of files) {
      lines.push(`- ${f.name} (${f.sizeBytes} bytes, ${f.contentType}, sha256: ${shortHash(f.sha256)})`);
    }
  }

  if (links.length > 0) {
    if (files.length > 0) lines.push("");
    lines.push("External links (advisory; not fetched by the judge):");
    for (const l of links) {
      lines.push(l.label ? `- ${l.url} — ${l.label}` : `- ${l.url}`);
    }
  }

  if (files.length === 0 && input.fileUrls.length > 0) {
    lines.push("");
    lines.push("Legacy file URLs:");
    for (const u of input.fileUrls) lines.push(`- ${u}`);
  }

  return lines.join("\n");
}

function renderPrompt(input: JudgeInput): string {
  const criteriaList = input.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join("\n");
  return JUDGE_PROMPT_V1
    .replace("{{title}}", input.title)
    .replace("{{description}}", input.description)
    .replace("{{acceptance_criteria}}", criteriaList)
    .replace("{{deliverable_text}}", input.deliverableText)
    .replace("{{attachments_section}}", renderAttachmentsSection(input));
}

interface GroqResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

export class GroqJudgeProvider implements JudgeProvider {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(opts?: { apiKey?: string; model?: string }) {
    const apiKey = opts?.apiKey ?? process.env["LLM_API_KEY"];
    if (!apiKey) {
      throw new Error("GroqJudgeProvider: LLM_API_KEY is required");
    }
    this.apiKey = apiKey;
    this.model = opts?.model ?? DEFAULT_MODEL;
  }

  async evaluate(input: JudgeInput): Promise<Verdict> {
    const prompt = renderPrompt(input);

    const res = await fetch(API_BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`GroqJudgeProvider: HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }

    const json = (await res.json()) as GroqResponse;
    if (json.error) {
      throw new Error(`GroqJudgeProvider: ${json.error.message ?? "unknown error"}`);
    }

    const text = json.choices?.[0]?.message?.content ?? "";
    if (!text) {
      throw new Error("GroqJudgeProvider: empty response");
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new Error(
        `GroqJudgeProvider: response was not valid JSON: ${text.slice(0, 200)}`,
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
