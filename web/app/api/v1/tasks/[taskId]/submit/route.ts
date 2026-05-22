import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { wrap } from "@/lib/handler";
import { serialize } from "@/lib/serialize";
import { requireSiwsOrApiKey } from "@/lib/auth";
import { submitDeliverable } from "@basira/shared";

export const POST = wrap(async (
  req: NextRequest,
  ctx: { params: Promise<{ taskId: string }> },
) => {
  const { wallet: agentWallet } = await requireSiwsOrApiKey(req);
  const { taskId } = await ctx.params;
  const body = await req.json();

  // The service now signs and broadcasts on the platform authority's behalf
  // and returns { deliverableId, txSignature, status }. The agent no longer
  // signs anything for submission.
  const result = await submitDeliverable(
    {
      taskId,
      contentText: body.contentText ?? "",
      files: Array.isArray(body.files) ? body.files : [],
      externalLinks: Array.isArray(body.externalLinks) ? body.externalLinks : [],
      fileUrls: Array.isArray(body.fileUrls) ? body.fileUrls : [],
    },
    agentWallet,
  );

  return NextResponse.json(serialize(result));
});
