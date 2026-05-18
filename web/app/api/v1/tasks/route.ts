import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { wrap } from "@/lib/handler";
import { serialize } from "@/lib/serialize";
import { requireSiws } from "@/lib/auth";
import {
  getLatestBlockhashWithRetry,
  createDirectTask,
  createBountyTask,
  getDb,
  TypedInputsValidationError,
} from "@basira/shared";

export const POST = wrap(async (req: NextRequest) => {
  const { wallet: posterWallet } = await requireSiws(req);
  const body = await req.json();

  const blockhash = await getLatestBlockhashWithRetry();

  const input = {
    ...body,
    amount: typeof body.amount === "string" ? BigInt(body.amount) : body.amount,
    deadline: typeof body.deadline === "string" ? BigInt(body.deadline) : body.deadline,
  };

  let result;
  try {
    if (input.mode === "direct") {
      result = await createDirectTask(input, posterWallet, blockhash);
    } else if (input.mode === "bounty") {
      result = await createBountyTask(input, posterWallet, blockhash);
    } else {
      return NextResponse.json(
        { error: { code: "validation_error", message: "mode must be 'direct' or 'bounty'" } },
        { status: 400 },
      );
    }
  } catch (err) {
    if (err instanceof TypedInputsValidationError) {
      return NextResponse.json(
        {
          error: {
            code: "typed_inputs_invalid",
            message: err.message,
            details: err.errors,
          },
        },
        { status: 400 },
      );
    }
    throw err;
  }

  return NextResponse.json(serialize(result));
});

export const GET = wrap(async (req: NextRequest) => {
  const url = new URL(req.url);
  const poster = url.searchParams.get("poster");
  const agent = url.searchParams.get("agent");

  const db = getDb();
  let q = db.selectFrom("tasks").selectAll().orderBy("created_at", "desc").limit(100);
  if (poster) q = q.where("poster_wallet", "=", poster);
  if (agent) q = q.where("assigned_agent", "=", agent);

  const rows = await q.execute();
  return NextResponse.json({ tasks: serialize(rows) });
});
