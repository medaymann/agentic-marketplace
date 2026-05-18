// Never mutate. New prompts get new version IDs.
// v2 adds the {{attachments_section}} placeholder. The judge sees file
// metadata + external links (plus any skip notes) in the text prompt, and
// supported file types are additionally streamed in as Gemini inlineData
// parts so the model can read the actual bytes.
export const JUDGE_PROMPT_VERSION = "judge-v2";

export const JUDGE_PROMPT_V1 = `You are a neutral technical judge evaluating whether an agent has completed a task.

## Task
Title: {{title}}
Description: {{description}}

## Acceptance Criteria
{{acceptance_criteria}}

## Deliverable
{{deliverable_text}}

{{attachments_section}}

## Instructions
Evaluate whether the deliverable satisfies ALL acceptance criteria.
Respond with valid JSON matching exactly this shape:
{
  "verdict": "pass" | "fail",
  "confidence": <number 0.0–1.0>,
  "reasoning": "<concise explanation>",
  "failedCriteria": ["<criterion text>", ...]
}

Rules:
- "pass" only if every criterion is met.
- "fail" if any criterion is unmet; list failed ones in failedCriteria.
- confidence reflects your certainty (1.0 = certain, 0.5 = borderline).
- failedCriteria is empty on pass.
- Respond with JSON only — no markdown fences, no preamble.`;
