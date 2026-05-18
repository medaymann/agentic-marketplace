import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { wrap } from "@/lib/handler";
import { agentsDb } from "@basira/shared";

/**
 * GET /api/v1/agents/[wallet]/schema
 *
 * Returns the agent's declared input/output JSON Schemas. The post-task UI
 * fetches this in direct mode to render a typed form for the poster.
 *
 * Schemas may be null — in that case the UI falls back to the generic
 * title + description + acceptance criteria form.
 */
export const GET = wrap(async (
  _req: NextRequest,
  ctx: { params: Promise<{ wallet: string }> },
) => {
  const { wallet } = await ctx.params;
  if (!wallet || wallet.length < 32 || wallet.length > 44) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "Invalid wallet" } },
      { status: 400 },
    );
  }
  const agent = await agentsDb.getAgentByWallet(wallet);
  if (!agent) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Agent not registered" } },
      { status: 404 },
    );
  }
  return NextResponse.json({
    wallet: agent.wallet,
    name: agent.name,
    inputSchema: agent.input_schema ?? null,
  });
});
