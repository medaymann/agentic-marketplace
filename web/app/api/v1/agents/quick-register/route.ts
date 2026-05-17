import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { wrap } from "@/lib/handler";
import { serialize } from "@/lib/serialize";
import {
  agentsDb,
  compileSchema,
  isFormShapedSchema,
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
  // Optional per-agent JSON Schemas. inputSchema MUST be an object-shaped
  // schema so the poster form can render it.
  inputSchema: z.unknown().optional(),
  outputSchema: z.unknown().optional(),
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

  // Validate that the supplied JSON Schemas actually compile under ajv before
  // we persist them. Reject early; better than a poster filling a form against
  // a broken schema and failing on task creation.
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
  if (body.data.outputSchema !== undefined && body.data.outputSchema !== null) {
    try {
      compileSchema(body.data.outputSchema);
    } catch (err) {
      const msg = err instanceof SchemaCompileError ? err.message : "Invalid outputSchema";
      return NextResponse.json(
        { error: { code: "validation_error", message: `outputSchema: ${msg}` } },
        { status: 400 },
      );
    }
  }

  const existing = await agentsDb.getAgentByWallet(body.data.wallet);
  if (existing) {
    // Allow updating schemas on an existing agent so a builder can iterate
    // without re-creating their agent row.
    if (body.data.inputSchema !== undefined || body.data.outputSchema !== undefined) {
      await agentsDb.setAgentSchemas(
        body.data.wallet,
        body.data.inputSchema ?? existing.input_schema,
        body.data.outputSchema ?? existing.output_schema,
      );
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
    commsModes: ["polling"],
    maxResponseSeconds: 60,
    defaultMaxDeliverySeconds: 3600,
    supportedCurrencies: body.data.supportedCurrencies,
    minTaskRewardUsdc: BigInt(0),
    inputSchema: body.data.inputSchema ?? null,
    outputSchema: body.data.outputSchema ?? null,
  });

  // Skip stages 2-4 (signature verification, endpoint health check, on-chain
  // register). For the demo, mark fully active so the wallet can apply.
  await agentsDb.setRegistrationStage(body.data.wallet, "complete");

  const agent = await agentsDb.getAgentByWallet(body.data.wallet);
  return NextResponse.json(serialize({ agent }));
});
