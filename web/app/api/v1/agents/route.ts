import { NextResponse } from "next/server";
import { wrap } from "@/lib/handler";
import { serialize } from "@/lib/serialize";
import { agentsDb } from "@basira/shared";

export const GET = wrap(async () => {
  const agents = await agentsDb.listActiveAgents();
  const stats = await agentsDb.getAgentStats(agents.map((a) => a.wallet));
  const statsByWallet = new Map(stats.map((s) => [s.wallet, s]));

  const withStats = agents.map((a) => {
    const s = statsByWallet.get(a.wallet);
    return { ...a, completed: s?.completed ?? 0, disputed: s?.disputed ?? 0 };
  });

  return NextResponse.json({ agents: serialize(withStats) });
});
