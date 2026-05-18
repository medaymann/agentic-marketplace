import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import dotenv from "dotenv";

// Load .env from repo root (../.env relative to daemon/), then fall back to cwd.
const here = dirname(fileURLToPath(import.meta.url));
const rootEnv = resolve(here, "..", "..", ".env");
if (existsSync(rootEnv)) {
  dotenv.config({ path: rootEnv });
} else {
  dotenv.config();
}

import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SOLANA_RPC_URL: z.string().url(),
  SOLANA_WS_URL: z.string().url(),
  PROGRAM_ID: z.string().min(32, "PROGRAM_ID must be set"),
  KEEPER_KEYPAIR_PATH: z.string().min(1),
  ARBITRATOR_KEYPAIR_PATH: z.string().min(1),
  LLM_PROVIDER: z.enum(["mock", "anthropic", "gemini", "groq"]).default("mock"),
  LLM_API_KEY: z.string().optional(),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  HEALTH_PORT: z.coerce.number().int().positive().default(8080),
  NODE_ENV: z.string().default("development"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid daemon environment:\n${issues}`);
  }
  if (
    (parsed.data.LLM_PROVIDER === "anthropic" || parsed.data.LLM_PROVIDER === "gemini" || parsed.data.LLM_PROVIDER === "groq") &&
    !parsed.data.LLM_API_KEY
  ) {
    throw new Error(`LLM_PROVIDER=${parsed.data.LLM_PROVIDER} requires LLM_API_KEY`);
  }
  cached = parsed.data;
  return cached;
}
