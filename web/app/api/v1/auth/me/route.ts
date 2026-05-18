import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { wrap } from "@/lib/handler";
import { serialize } from "@/lib/serialize";
import { registry } from "@/lib/openapi";
import { requireSiws } from "@/lib/auth";
import { UnauthorizedError } from "@/lib/errors";
import { z } from "zod";

/**
 * GET /api/v1/auth/me
 *
 * Returns the wallet attached to the current SIWS cookie, or 401 if the
 * caller is unauthenticated. The browser uses this on mount to decide
 * whether to prompt for a sign-in signature.
 */
export const GET = wrap(async (req: NextRequest) => {
  try {
    const { wallet } = await requireSiws(req);
    return NextResponse.json(serialize({ wallet }));
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json(
        { error: { code: "unauthorized", message: err.message } },
        { status: 401 },
      );
    }
    throw err;
  }
});

registry.registerPath({
  method: "get",
  path: "/api/v1/auth/me",
  security: [{ cookieAuth: [] }],
  responses: {
    "200": {
      description: "Current session wallet",
      content: {
        "application/json": {
          schema: z.object({ wallet: z.string() }),
        },
      },
    },
    "401": { description: "Not signed in" },
  },
  tags: ["auth"],
});
