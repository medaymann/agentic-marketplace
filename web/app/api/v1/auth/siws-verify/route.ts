import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { wrap } from "@/lib/handler";
import { verifySIWS, siwsVerifyInputSchema } from "@basira/shared";
import { serialize } from "@/lib/serialize";
import { registry } from "@/lib/openapi";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { z } from "zod";

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export const POST = wrap(async (req: NextRequest) => {
  const body = siwsVerifyInputSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: "Invalid request body",
          details: body.error.issues,
        },
      },
      { status: 400 },
    );
  }

  let result: Awaited<ReturnType<typeof verifySIWS>>;
  try {
    result = await verifySIWS(body.data);
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "unauthorized",
          message: err instanceof Error ? err.message : "Verification failed",
        },
      },
      { status: 401 },
    );
  }

  const { sessionToken, wallet, expiresAt } = result;

  const response = NextResponse.json(
    serialize({ wallet, expiresAt }),
  );

  response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });

  return response;
});

registry.registerPath({
  method: "post",
  path: "/api/v1/auth/siws-verify",
  security: [],
  request: {
    body: {
      content: {
        "application/json": {
          schema: siwsVerifyInputSchema,
        },
      },
    },
  },
  responses: {
    "200": {
      description: "SIWS session created, cookie set",
      content: {
        "application/json": {
          schema: z.object({
            wallet: z.string(),
            expiresAt: z.string(),
          }),
        },
      },
    },
  },
  tags: ["auth"],
});