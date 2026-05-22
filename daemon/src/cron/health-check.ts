import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { agentsDb, signWebhookBody } from "@basira/shared";
import { getLogger } from "../log.js";

const HEALTH_TIMEOUT_MS = 10_000;
const MAX_FAILURES = 3;

/** HMAC-SHA256(secret, nonce) — the agent's expected health-check response. */
function hmacNonce(secret: string, nonce: string): string {
  return createHmac("sha256", secret).update(nonce).digest("hex");
}

export interface SweepResult {
  checked: number;
  ok: number;
  failed: number;
  deactivated: number;
}

interface AgentHealthResponse {
  protocol_version?: string;
  status?: string;
  // HMAC-SHA256(webhook_secret, nonce) — proves the agent holds the shared
  // secret without needing a Solana keypair.
  nonce_hmac?: string;
}

async function pingAgent(
  endpointUrl: string,
  body: { nonce: string; timestamp: string; signature: string },
): Promise<AgentHealthResponse> {
  const url = `${endpointUrl.replace(/\/$/, "")}/basira/health`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`status ${response.status}`);
    }
    return (await response.json()) as AgentHealthResponse;
  } finally {
    clearTimeout(timer);
  }
}

export async function runHealthCheckSweep(): Promise<SweepResult> {
  const log = getLogger().child({ cron: "health-check" });
  const agents = await agentsDb.listActiveAgents();
  let ok = 0;
  let failed = 0;
  let deactivated = 0;

  if (agents.length === 0) return { checked: 0, ok, failed, deactivated };

  for (const agent of agents) {
    try {
      const secret = agent.webhook_secret ?? "";
      const nonce = randomBytes(16).toString("hex");
      const timestamp = String(Math.floor(Date.now() / 1000));
      // Challenge: HMAC over `${timestamp}.${nonce}` keyed by the agent's
      // webhook_secret — same scheme as webhook signing.
      const challengeSig = signWebhookBody(secret, timestamp, nonce);

      const response = await pingAgent(agent.endpoint_url, {
        nonce,
        timestamp,
        signature: challengeSig,
      });

      if (response.status !== "ok" || !response.nonce_hmac) {
        throw new Error("agent did not return nonce_hmac");
      }
      // The agent proves liveness + secret possession by returning
      // HMAC-SHA256(webhook_secret, nonce). No Solana keypair involved.
      const got = Buffer.from(response.nonce_hmac, "hex");
      const want = Buffer.from(hmacNonce(secret, nonce), "hex");
      if (got.length !== want.length || !timingSafeEqual(got, want)) {
        throw new Error("invalid nonce_hmac");
      }

      await agentsDb.recordHealthCheck(agent.wallet, new Date());
      ok++;
    } catch (err) {
      const failures = await agentsDb.incrementHealthFailure(agent.wallet);
      log.warn(
        { wallet: agent.wallet, err: err instanceof Error ? err.message : String(err), failures },
        "health-check failed",
      );
      failed++;
      if (failures >= MAX_FAILURES) {
        await agentsDb.setStatus(agent.wallet, "inactive");
        deactivated++;
      }
    }
  }

  log.info({ checked: agents.length, ok, failed, deactivated }, "health-check sweep done");
  return { checked: agents.length, ok, failed, deactivated };
}
