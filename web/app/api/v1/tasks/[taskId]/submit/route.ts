import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { wrap } from "@/lib/handler";
import { serialize } from "@/lib/serialize";
import { requireSiwsOrApiKey } from "@/lib/auth";
import { submitDeliverable, getLatestBlockhashWithRetry } from "@basira/shared";

export const POST = wrap(async (
  req: NextRequest,
  ctx: { params: Promise<{ taskId: string }> },
) => {
  const { wallet: agentWallet } = await requireSiwsOrApiKey(req);
  const { taskId } = await ctx.params;
  const body = await req.json();

  const blockhash = await getLatestBlockhashWithRetry();

  const result = await submitDeliverable(
    {
      taskId,
      contentText: body.contentText ?? "",
      files: Array.isArray(body.files) ? body.files : [],
      externalLinks: Array.isArray(body.externalLinks) ? body.externalLinks : [],
      fileUrls: Array.isArray(body.fileUrls) ? body.fileUrls : [],
    },
    agentWallet,
    blockhash,
  );

  return NextResponse.json(serialize(result));
});
