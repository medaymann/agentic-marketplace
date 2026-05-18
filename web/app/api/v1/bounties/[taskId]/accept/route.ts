import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { wrap } from "@/lib/handler";
import { serialize } from "@/lib/serialize";
import { requireSiws } from "@/lib/auth";
import { acceptApplicant, getLatestBlockhashWithRetry } from "@basira/shared";

export const POST = wrap(async (
  req: NextRequest,
  ctx: { params: Promise<{ taskId: string }> },
) => {
  const { wallet: posterWallet } = await requireSiws(req);
  const { taskId } = await ctx.params;
  const body = await req.json();

  if (typeof body?.applicationId !== "string") {
    return NextResponse.json(
      { error: { code: "validation_error", message: "applicationId is required" } },
      { status: 400 },
    );
  }

  const blockhash = await getLatestBlockhashWithRetry();

  const result = await acceptApplicant(
    { taskId, applicationId: body.applicationId },
    posterWallet,
    blockhash,
  );

  return NextResponse.json(serialize(result));
});
