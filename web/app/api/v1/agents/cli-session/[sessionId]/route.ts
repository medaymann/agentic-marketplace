import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { wrap } from "@/lib/handler";
import { serialize } from "@/lib/serialize";
import { sessionsDb } from "@basira/shared";

/**
 * GET /api/v1/agents/cli-session/:sessionId
 *
 * Browser uses this to fetch the canonical signing message for the session
 * (server-issued so the CLI can't ask the user to sign something else).
 * Returns the message + a small bit of context for display.
 */
export const GET = wrap(async (
  _req: NextRequest,
  ctx: { params: Promise<{ sessionId: string }> },
) => {
  const { sessionId } = await ctx.params;
  const session = await sessionsDb.getSession(sessionId);
  if (!session) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Session not found or expired" } },
      { status: 404 },
    );
  }
  if (session.kind !== "cli_onboarding") {
    return NextResponse.json(
      { error: { code: "forbidden", message: "Wrong session kind" } },
      { status: 403 },
    );
  }

  const data = session.data as {
    message: string;
    agent: { name: string };
    status: string;
  };

  return NextResponse.json(serialize({
    message: data.message,
    agentName: data.agent?.name ?? null,
    status: data.status,
    expiresAt: session.expires_at,
  }));
});
