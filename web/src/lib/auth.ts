import type { NextRequest } from "next/server";
import { sessionsDb, verifyApiKey as sharedVerifyApiKey } from "@basira/shared";
import { UnauthorizedError } from "./errors";

const SESSION_COOKIE = "basira_session";

export interface AuthContext {
  wallet: string;
}

/**
 * Reads the session cookie, looks up the SIWS session, returns the wallet.
 * Throws UnauthorizedError if missing/expired/wrong-kind.
 */
export async function requireSiws(req: NextRequest): Promise<AuthContext> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) throw new UnauthorizedError("Missing session cookie");
  const session = await sessionsDb.getSession(token);
  if (!session) throw new UnauthorizedError("Session not found or expired");
  if (session.kind !== "siws") throw new UnauthorizedError("Wrong session kind");
  if (!session.wallet) throw new UnauthorizedError("Session has no wallet");
  return { wallet: session.wallet };
}

/**
 * Reads the Authorization: Bearer <token> header and resolves it to a wallet
 * via the shared bcrypt scan.
 */
export async function requireApiKey(req: NextRequest): Promise<AuthContext> {
  const header = req.headers.get("authorization");
  if (!header) throw new UnauthorizedError("Missing Authorization header");
  try {
    const result = await sharedVerifyApiKey(header);
    return { wallet: result.wallet };
  } catch (err) {
    throw new UnauthorizedError(
      err instanceof Error ? err.message : "Invalid API key",
    );
  }
}

/**
 * Either-or auth: accepts a SIWS cookie (browser flow) OR an Authorization
 * Bearer API key (autonomous agent flow). Throws UnauthorizedError if neither
 * is present and valid. Use for routes that may be hit by both surfaces.
 */
export async function requireSiwsOrApiKey(
  req: NextRequest,
): Promise<AuthContext> {
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (cookie) {
    try {
      return await requireSiws(req);
    } catch {
      // fall through to API key
    }
  }
  const header = req.headers.get("authorization");
  if (header) return requireApiKey(req);
  throw new UnauthorizedError(
    "Authenticate with a session cookie or Authorization: Bearer <apiKey>",
  );
}

/**
 * Optional auth: returns the wallet if either credential is present and valid,
 * null otherwise. Never throws on missing credentials; only on malformed ones.
 */
export async function optionalAuth(
  req: NextRequest,
): Promise<AuthContext | null> {
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (cookie) {
    try {
      return await requireSiws(req);
    } catch {
      // fall through
    }
  }
  const header = req.headers.get("authorization");
  if (header) {
    try {
      return await requireApiKey(req);
    } catch {
      // fall through
    }
  }
  return null;
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
