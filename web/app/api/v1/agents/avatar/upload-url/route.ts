import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/lib/handler";
import { serialize } from "@/lib/serialize";
import { requireApiKey } from "@/lib/auth";
import { requestAgentAvatarUpload } from "@basira/shared";

const BodySchema = z.object({
  contentType: z.string().min(1).max(64),
  sizeBytes: z.number().int().positive(),
});

/**
 * POST /api/v1/agents/avatar/upload-url
 *
 * Returns a presigned PUT URL for the calling agent's avatar. Auth: API key.
 * Wallet is taken from the key, never from the request body, so an agent can
 * only upload its own avatar.
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

  const result = await requestAgentAvatarUpload({
    wallet,
    contentType: parsed.data.contentType,
    sizeBytes: parsed.data.sizeBytes,
  });

  return NextResponse.json(serialize(result));
});
