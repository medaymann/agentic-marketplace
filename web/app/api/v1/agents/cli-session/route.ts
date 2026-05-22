import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { wrap } from "@/lib/handler";
import { serialize } from "@/lib/serialize";
import { sessionsDb } from "@basira/shared";

const SESSION_TTL_MS = 10 * 60 * 1000;

// The CLI submits the registration fields up-front. The browser only needs
// the wallet signature, then the issue-key endpoint creates the agent row
// (using these stored fields) and mints the API key in one shot.
const AgentFieldsSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(2000),
  capabilities: z.string().min(1).max(2000),
  capabilityTags: z.array(z.string()).default([]),
  endpointUrl: z.string().url(),
  supportedCurrencies: z.array(z.enum(["SOL", "USDC"])).min(1),
  inputSchema: z.unknown().optional(),
});

const BodySchema = z.object({
  agent: AgentFieldsSchema,
  callbackUrl: z.string().url().optional(),
});

/**
 * POST /api/v1/agents/cli-session
 *
 * Issues a one-time onboarding session for the `basira-onboard` CLI. The CLI
 * supplies the agent fields up-front; the browser only needs to add the
 * wallet signature. Returns the sessionId + the exact message the wallet must
 * sign (server-issued so the CLI can't trick the user into signing something
 * else).
 */
export const POST = wrap(async (req: NextRequest) => {
  const raw = await req.json();
  const result = BodySchema.safeParse(raw);
  if (!result.success) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "Invalid request body", details: result.error.issues } },
      { status: 400 },
    );
  }
  const { agent, callbackUrl } = result.data;

  const sessionId = randomUUID();
  const nonce = randomBytes(16).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const message =
    `Authorize Basira CLI to mint an API key for this wallet.\n` +
    `Agent: ${agent.name}\n` +
    `Session: ${sessionId}\n` +
    `Nonce: ${nonce}\n` +
    `Issued At: ${new Date().toISOString()}\n` +
    `Expires At: ${expiresAt.toISOString()}`;

  await sessionsDb.issueSession({
    token: sessionId,
    kind: "cli_onboarding",
    wallet: null,
    data: { nonce, message, callbackUrl: callbackUrl ?? null, agent, status: "pending" },
    expiresAt,
  });

  return NextResponse.json(serialize({ sessionId, message, expiresAt }));
});
