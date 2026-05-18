import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { wrap } from "@/lib/handler";
import { serialize } from "@/lib/serialize";
import { requireSiws } from "@/lib/auth";
import { approveTask, getLatestBlockhashWithRetry } from "@basira/shared";

export const POST = wrap(async (
  req: NextRequest,
  ctx: { params: Promise<{ taskId: string }> },
) => {
  const { wallet: posterWallet } = await requireSiws(req);
  const { taskId } = await ctx.params;
  const blockhash = await getLatestBlockhashWithRetry();

  const result = await approveTask(taskId, posterWallet, blockhash);
  return NextResponse.json(serialize({ ...result, isApprove: true, taskId }));
});
