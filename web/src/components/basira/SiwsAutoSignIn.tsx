"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";

/**
 * Lives once at the app root (inside the wallet provider). Watches the
 * connected wallet and silently establishes a SIWS session when needed:
 *
 *  - On wallet connect, GET /auth/me. If 200 and the cookie wallet matches the
 *    connected wallet, do nothing.
 *  - If 401 or a wallet mismatch, fetch a SIWS challenge, prompt the wallet
 *    to signMessage, POST /auth/siws-verify. The browser cookie is set by
 *    the verify response.
 *  - On wallet disconnect, POST /auth/logout to drop the cookie.
 *
 * Renders an optional inline status banner so the user understands why their
 * wallet is showing a signature prompt.
 */
export function SiwsAutoSignIn() {
  const pathname = usePathname();
  const { publicKey, signMessage, disconnecting, connecting } = useWallet();

  // The CLI onboarding flow uses its own out-of-band wallet handshake to mint
  // an agent API key. We don't want a user-session SIWS cookie attached to
  // whichever wallet the user uses there.
  if (pathname?.startsWith("/agents/onboard")) {
    return null;
  }
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "signing" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  // Avoid duplicate prompts when the wallet adapter re-emits the same publicKey.
  const lastHandled = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function ensureSession() {
      if (!publicKey || !signMessage) return;
      const walletStr = publicKey.toBase58();
      if (lastHandled.current === walletStr) return;
      lastHandled.current = walletStr;

      // 1. Already signed in as this wallet?
      const me = await fetch("/api/v1/auth/me", { credentials: "include" });
      if (cancelled) return;
      if (me.ok) {
        const json = (await me.json()) as { wallet?: string };
        if (json.wallet === walletStr) {
          setStatus({ kind: "idle" });
          return;
        }
        // Different wallet was signed in — drop that session first.
        await fetch("/api/v1/auth/logout", {
          method: "POST",
          credentials: "include",
        }).catch(() => {});
      }

      // 2. Get a challenge and ask the wallet to sign it.
      setStatus({ kind: "signing" });
      try {
        const chRes = await fetch("/api/v1/auth/siws-challenge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ wallet: walletStr }),
        });
        if (!chRes.ok) throw new Error("Challenge request failed");
        const { message } = (await chRes.json()) as { message: string };

        const messageBytes = new TextEncoder().encode(message);
        const sigBytes = await signMessage(messageBytes);
        const signature = bs58.encode(sigBytes);

        const verifyRes = await fetch("/api/v1/auth/siws-verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            message,
            signature,
            publicKey: walletStr,
          }),
        });
        if (cancelled) return;
        if (!verifyRes.ok) {
          const err = (await verifyRes.json().catch(() => ({}))) as {
            error?: { message?: string };
          };
          throw new Error(err.error?.message ?? "Sign-in failed");
        }
        setStatus({ kind: "idle" });
      } catch (e) {
        // If the user rejected the signature, leave them able to retry next
        // time the publicKey effect re-fires (clear lastHandled).
        lastHandled.current = null;
        setStatus({
          kind: "error",
          message: e instanceof Error ? e.message : "Sign-in failed",
        });
      }
    }

    void ensureSession();
    return () => {
      cancelled = true;
    };
  }, [publicKey, signMessage]);

  // Drop the cookie when the wallet disconnects so the next session must
  // start with a fresh signature.
  useEffect(() => {
    if (disconnecting) {
      lastHandled.current = null;
      void fetch("/api/v1/auth/logout", {
        method: "POST",
        credentials: "include",
      }).catch(() => {});
    }
  }, [disconnecting]);

  if (status.kind === "signing") {
    return (
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 rounded-lg border px-3 py-2 text-xs font-mono"
        style={{ borderColor: "rgba(169,120,235,0.45)", background: "rgba(169,120,235,0.08)", color: "#C9B6F2" }}
      >
        Approve the sign-in request in your wallet…
      </div>
    );
  }
  if (status.kind === "error") {
    return (
      <div className="fixed bottom-4 right-4 z-50 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
        Sign-in failed: {status.message}
      </div>
    );
  }
  // Touch `connecting` so the linter doesn't complain about the unused destructure.
  void connecting;
  return null;
}
