import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { wrap } from "@/lib/handler";
import { serialize } from "@/lib/serialize";
import {
  agentsDb,
  compileSchema,
  isFormShapedSchema,
  registerAgentOnChain,
  SchemaCompileError,
} from "@basira/shared";
import { z } from "zod";

// Demo-grade agent registration. Skips the 3-stage SIWS / endpoint-proof flow.
// Inserts directly with status=active so a wallet can immediately apply to bounties.
const inputSchema = z.object({
  wallet: z.string().min(32).max(44),
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(2000),
  capabilities: z.string().min(1).max(2000),
  capabilityTags: z.array(z.string()).default([]),
  endpointUrl: z.string().url().default("https://example.com"),
  supportedCurrencies: z.array(z.enum(["SOL", "USDC"])).min(1).default(["SOL"]),
  // Optional input JSON Schema. MUST be an object-shaped schema so the poster
  // form can render it. When omitted, posters use the generic free-text form.
  inputSchema: z.unknown().optional(),
});

export const POST = wrap(async (req: NextRequest) => {
  const body = inputSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: "Invalid input",
          details: body.error.issues,
        },
      },
      { status: 400 },
    );
  }

  // Validate that the supplied input schema compiles under ajv before we
  // persist it. Reject early; better than a poster filling a form against a
  // broken schema and failing on task creation.
  if (body.data.inputSchema !== undefined && body.data.inputSchema !== null) {
    if (!isFormShapedSchema(body.data.inputSchema)) {
      return NextResponse.json(
        {
          error: {
            code: "validation_error",
            message: 'inputSchema must be a JSON Schema with top-level `"type": "object"`',
          },
        },
        { status: 400 },
      );
    }
    try {
      compileSchema(body.data.inputSchema);
    } catch (err) {
      const msg = err instanceof SchemaCompileError ? err.message : "Invalid inputSchema";
      return NextResponse.json(
        { error: { code: "validation_error", message: `inputSchema: ${msg}` } },
        { status: 400 },
      );
    }
  }

  const existing = await agentsDb.getAgentByWallet(body.data.wallet);
  if (existing) {
    // Self-heal: an agent row may predate keeper-signed on-chain registration
    // (or a prior attempt may have failed before the PDA landed). This is
    // idempotent — a no-op when the PDA already exists — so it's safe to run on
    // every re-submit and repairs legacy agents that would otherwise be
    // unpayable (approve_* reads this PDA).
    try {
      await registerAgentOnChain(body.data.wallet);
    } catch (err) {
      console.error(`On-chain register_agent failed for ${body.data.wallet}:`, err);
      return NextResponse.json(
        {
          error: {
            code: "onchain_register_failed",
            message:
              "On-chain agent registration failed. Submit again to retry registration.",
          },
        },
        { status: 502 },
      );
    }

    // Allow updating the schema on an existing agent so a builder can iterate
    // without re-creating their agent row.
    if (body.data.inputSchema !== undefined) {
      await agentsDb.setAgentInputSchema(body.data.wallet, body.data.inputSchema);
      const agent = await agentsDb.getAgentByWallet(body.data.wallet);
      return NextResponse.json(serialize({ agent }));
    }
    return NextResponse.json(
      { error: { code: "conflict", message: "Agent already registered for this wallet" } },
      { status: 409 },
    );
  }

  await agentsDb.insertPendingAgent({
    wallet: body.data.wallet,
    name: body.data.name,
    description: body.data.description,
    capabilities: body.data.capabilities,
    capabilityTags: body.data.capabilityTags,
    endpointUrl: body.data.endpointUrl,
    maxResponseSeconds: 60,
    defaultMaxDeliverySeconds: 3600,
    supportedCurrencies: body.data.supportedCurrencies,
    minTaskRewardUsdc: BigInt(0),
    inputSchema: body.data.inputSchema ?? null,
  });

  // Skip stages 2-3 (signature verification, endpoint health check). For the
  // demo, mark fully active so the wallet can apply.
  await agentsDb.setRegistrationStage(body.data.wallet, "complete");

  // Create the on-chain AgentAccount PDA, keeper-signed. Required before the
  // agent can be assigned or paid (assign_agent / approve_* read this PDA).
  // We wait for confirmation: there is no retry path downstream, so a silent
  // failure here would leave the agent unpayable. On failure, surface a
  // retryable error — the DB row persists and registerAgentOnChain is
  // idempotent, so re-submitting the form completes registration.
  try {
    await registerAgentOnChain(body.data.wallet);
  } catch (err) {
    console.error(`On-chain register_agent failed for ${body.data.wallet}:`, err);
    return NextResponse.json(
      {
        error: {
          code: "onchain_register_failed",
          message:
            "On-chain agent registration failed. Your profile was saved — submit again to retry registration.",
        },
      },
      { status: 502 },
    );
  }

  const agent = await agentsDb.getAgentByWallet(body.data.wallet);
  return NextResponse.json(serialize({ agent }));
});
