import type { DeliverableFile, ExternalLink } from "../storage/types";

export interface JudgeInput {
  taskId: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  deliverableText: string;
  // Legacy. Kept so older callers and tests don't break. New code should use `files`.
  fileUrls: string[];
  // Hash-bound files. The provider streams these from storage and inlines the
  // bytes for supported MIME types (PDF, image, audio, text) within a budget.
  files?: DeliverableFile[];
  // Off-platform references. Listed in the prompt as context; never fetched.
  externalLinks?: ExternalLink[];
}

export interface Verdict {
  verdict: "pass" | "fail" | "unavailable";
  confidence: number;
  reasoning: string;
  failedCriteria: string[];
  model: string;
  promptVersion: string;
}

export interface JudgeProvider {
  evaluate(input: JudgeInput): Promise<Verdict>;
}
