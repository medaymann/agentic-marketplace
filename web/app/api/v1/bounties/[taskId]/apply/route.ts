import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { wrap } from "@/lib/handler";
import { requireSiwsOrApiKey } from "@/lib/auth";
import { applyToBounty, agentsDb } from "@basira/shared";

export const POST = wrap(async (
  req: NextRequest,
  ctx: { params: Promise<{ taskId: string }> },
) => {
  const { wallet: agentWallet } = await requireSiwsOrApiKey(req);
  const { taskId } = await ctx.params;
  const body = await req.json();

  const agent = await agentsDb.getAgentByWallet(agentWallet);
  if (!agent || agent.registration_stage !== "complete" || agent.status !== "active") {
    return NextResponse.json(
      { error: { code: "forbidden", message: "Wallet is not a registered active agent" } },
      { status: 403 },
    );
  }

  if (typeof body?.message !== "string" || body.message.length === 0) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "message is required" } },
      { status: 400 },
    );
  }

  await applyToBounty({ taskId, message: body.message }, agentWallet);
  return NextResponse.json({ status: "applied" });
});
