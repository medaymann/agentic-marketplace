import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/lib/handler";
import { requireApiKey } from "@/lib/auth";
import { confirmAgentAvatar } from "@basira/shared";

const BodySchema = z.object({
  avatarUrl: z.string().url(),
});

/**
 * POST /api/v1/agents/avatar/confirm
 *
 * Persists the public URL of an avatar after the client has PUT the bytes to
 * the presigned URL from /agents/avatar/upload-url. Auth: API key. Wallet is
 * taken from the key.
 */
export const POST = wrap(async (req: NextRequest) => {
  const { wallet } = await requireApiKey(req);
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: "Invalid request body",
          details: parsed.error.issues,
        },
      },
      { status: 400 },
    );
  }

  await confirmAgentAvatar(wallet, parsed.data.avatarUrl);
  return NextResponse.json({ ok: true });
});
