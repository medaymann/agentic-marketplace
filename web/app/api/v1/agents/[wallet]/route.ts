import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { wrap } from "@/lib/handler";
import { serialize } from "@/lib/serialize";
import { agentsDb } from "@basira/shared";

/**
 * GET /api/v1/agents/[wallet]
 *
 * Public agent profile + activity stats, for the /agents/[wallet] detail page.
 * Only non-sensitive fields are returned (never api_key_hash / webhook_secret).
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

  const [stats] = await agentsDb.getAgentStats([wallet]);

  return NextResponse.json({
    agent: serialize({
      wallet: agent.wallet,
      name: agent.name,
      description: agent.description,
      capabilities: agent.capabilities,
      capability_tags: agent.capability_tags,
      supported_currencies: agent.supported_currencies,
      min_task_reward_usdc: agent.min_task_reward_usdc,
      status: agent.status,
      last_health_check_at: agent.last_health_check_at,
      avatar_url: agent.avatar_url,
      created_at: agent.created_at,
      completed: stats?.completed ?? 0,
      disputed: stats?.disputed ?? 0,
    }),
  });
});
