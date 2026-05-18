import type { JudgeProvider } from "./types";
import { MockJudgeProvider } from "./providers/mock";
import { AnthropicJudgeProvider } from "./providers/anthropic";
import { GeminiJudgeProvider } from "./providers/gemini";
import { GroqJudgeProvider } from "./providers/groq";

export function selectProvider(): JudgeProvider {
  const name = process.env["LLM_PROVIDER"] ?? "mock";
  switch (name) {
    case "mock":
      return new MockJudgeProvider();
    case "anthropic":
      return new AnthropicJudgeProvider();
    case "gemini":
      return new GeminiJudgeProvider();
    case "groq":
      return new GroqJudgeProvider();
    default:
      throw new Error(`Unknown LLM_PROVIDER: "${name}"`);
  }
}
