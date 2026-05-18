import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { wrap } from "@/lib/handler";
import { serialize } from "@/lib/serialize";
import { requireSiwsOrApiKey } from "@/lib/auth";
import { getDeliverableDownloadUrl } from "@basira/shared";

/**
 * POST /api/v1/tasks/[taskId]/deliverable/download-url
 *
 * Returns a short-lived presigned GET URL for one file on the task's
 * deliverable. Callable by the poster or the assigned agent.
 *
 * POST (not GET) so the storage key sits in the request body, not in
 * request logs or browser history.
 */
export const POST = wrap(async (
  req: NextRequest,
  ctx: { params: Promise<{ taskId: string }> },
) => {
  const { wallet } = await requireSiwsOrApiKey(req);
  const { taskId } = await ctx.params;
  const body = await req.json();

  if (typeof body?.key !== "string" || body.key.length === 0) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "key is required" } },
      { status: 400 },
    );
  }

  const result = await getDeliverableDownloadUrl({
    taskId,
    key: body.key,
    requesterWallet: wallet,
  });

  return NextResponse.json(serialize(result));
});
