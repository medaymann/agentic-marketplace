import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { wrap } from "@/lib/handler";
import { serialize } from "@/lib/serialize";
import {
  tasksDb,
  bountyApplicationsDb,
  deliverablesDb,
  judgeVerdictsDb,
  disputesDb,
  settlementsDb,
  agentsDb,
} from "@basira/shared";

export const GET = wrap(async (
  _req: NextRequest,
  ctx: { params: Promise<{ taskId: string }> },
) => {
  const { taskId } = await ctx.params;

  const task = await tasksDb.getTaskById(taskId);
  if (!task) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Task not found" } },
      { status: 404 },
    );
  }

  const [rawApplications, deliverable, verdict, dispute, settlements] = await Promise.all([
    bountyApplicationsDb.listApplicationsForTask(taskId).catch(() => []),
    deliverablesDb.getLatestForTask(taskId).catch(() => null),
    judgeVerdictsDb.getLatestVerdictForTask(taskId).catch(() => null),
    disputesDb.getOpenDisputeForTask(taskId).catch(() => null),
    settlementsDb.listSettlementsForTask(taskId).catch(() => []),
  ]);

  // Batch-fetch applicant agents in one query (was an N+1: one lookup per
  // application, on a route polled every few seconds).
  const agentRows = await agentsDb
    .getAgentsByWallets(rawApplications.map((a) => a.agent_wallet))
    .catch(() => []);
  const agentByWallet = new Map(agentRows.map((agent) => [agent.wallet, agent]));
  const applications = rawApplications.map((a) => {
    const agent = agentByWallet.get(a.agent_wallet);
    return {
      ...a,
      agent_name: agent?.name ?? null,
      agent_capability_tags: agent?.capability_tags ?? [],
      agent_joined_at: agent?.created_at ?? null,
    };
  });

  return NextResponse.json(
    serialize({ task, applications, deliverable, verdict, dispute, settlements }),
  );
});
