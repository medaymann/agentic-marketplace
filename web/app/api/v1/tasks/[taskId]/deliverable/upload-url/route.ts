import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { wrap } from "@/lib/handler";
import { serialize } from "@/lib/serialize";
import { requireSiwsOrApiKey } from "@/lib/auth";
import { getDeliverableUploadUrl } from "@basira/shared";

/**
 * POST /api/v1/tasks/[taskId]/deliverable/upload-url
 *
 * Returns a presigned PUT URL that the assigned agent uses to upload one
 * file directly to the platform's R2 bucket. Auth is cookie-or-API-key so
 * autonomous agents work too. The service rejects callers who aren't the
 * task's assigned agent.
 */
export const POST = wrap(async (
  req: NextRequest,
  ctx: { params: Promise<{ taskId: string }> },
) => {
  const { wallet } = await requireSiwsOrApiKey(req);
  const { taskId } = await ctx.params;
  const body = await req.json();

  const result = await getDeliverableUploadUrl(
    {
      taskId,
      filename: body?.filename,
      contentType: body?.contentType,
      sizeBytes: body?.sizeBytes,
    },
    wallet,
  );

  return NextResponse.json(serialize(result));
});
