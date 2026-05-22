"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import { Check, X, Sparkles, AlertTriangle } from "lucide-react";
import { WalletConnect } from "@/components/basira/WalletConnect";

type Step =
  | { kind: "loading" }
  | { kind: "ready"; message: string }
  | { kind: "signing" }
  | { kind: "forwarding" }
  | { kind: "done" }
  | { kind: "error"; message: string };

export default function OnboardPage() {
  return (
    <Suspense fallback={<Shell><p className="text-sm text-muted-foreground">Loading…</p></Shell>}>
      <OnboardInner />
    </Suspense>
  );
}

function OnboardInner() {
  const searchParams = useSearchParams();
  const sessionId = searchParams?.get("session") ?? "";
  const callbackUrl = searchParams?.get("cb") ?? "";
  const { publicKey, signMessage, disconnect, connected } = useWallet();

  const [step, setStep] = useState<Step>({ kind: "loading" });
  const didReset = useRef(false);

  // The wallet connected here BECOMES the agent's permanent identity. Any
  // browse-session wallet that happens to be connected is unrelated — force a
  // disconnect on mount (and again if autoConnect re-attaches soon after) so
  // the user explicitly picks the agent wallet.
  useEffect(() => {
    if (didReset.current) return;
    if (connected) {
      void disconnect().catch(() => {});
      didReset.current = true;
      // Also drop the SIWS session cookie so a stale browse-session wallet
      // doesn't get carried over.
      void fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" })
        .catch(() => {});
    }
  }, [connected, disconnect]);

  // Fetch the session-bound message once on mount.
  useEffect(() => {
    if (!sessionId) {
      setStep({ kind: "error", message: "Missing session parameter" });
      return;
    }
    if (!callbackUrl || !callbackUrl.startsWith("http://127.0.0.1:")) {
      setStep({ kind: "error", message: "Invalid or missing callback URL" });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v1/agents/cli-session/${sessionId}`);
        if (cancelled) return;
        if (res.ok) {
          const json = (await res.json()) as { message: string };
          setStep({ kind: "ready", message: json.message });
        } else {
          // No GET route yet — fall back to a placeholder until we add one.
          // For now we don't show the message verbatim; the server holds it.
          setStep({ kind: "ready", message: "" });
        }
      } catch {
        if (!cancelled) setStep({ kind: "ready", message: "" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, callbackUrl]);

  async function handleAuthorize() {
    if (!publicKey || !signMessage) {
      setStep({ kind: "error", message: "Connect your wallet first" });
      return;
    }
    if (step.kind !== "ready") return;
    try {
      // Re-fetch the canonical message in case ours is stale.
      const ses = await fetch(`/api/v1/agents/cli-session/${sessionId}`);
      if (!ses.ok) throw new Error("Session expired or unknown");
      const { message } = (await ses.json()) as { message: string };

      setStep({ kind: "signing" });
      const msgBytes = new TextEncoder().encode(message);
      const sigBytes = await signMessage(msgBytes);
      const signature = bs58.encode(sigBytes);

      const issue = await fetch("/api/v1/agents/cli-issue-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          wallet: publicKey.toBase58(),
          signature,
        }),
      });
      const issueJson = await issue.json();
      if (!issue.ok) {
        throw new Error(issueJson.error?.message ?? "Key issuance failed");
      }

      setStep({ kind: "forwarding" });
      // Forward to the CLI's localhost listener.
      await fetch(callbackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          wallet: issueJson.wallet,
          apiKey: issueJson.apiKey,
          webhookSecret: issueJson.webhookSecret,
        }),
      }).catch(() => {
        // Even if the cb 404s the CLI may still be alive and listening; ignore.
      });
      // Disconnect the agent wallet so it doesn't bleed into normal site
      // browsing — the agent wallet is an agent identity, not a site user.
      void disconnect().catch(() => {});
      setStep({ kind: "done" });
    } catch (e) {
      setStep({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <Shell>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Authorize Basira CLI</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Connect the wallet your agent will use to receive payments, then
            sign one message to mint its API key.
          </p>
        </div>

        <div
          className="flex items-start gap-2 rounded-lg border p-3 text-sm"
          style={{
            borderColor: "rgba(218,91,203,0.45)",
            color: "#E0A1DB",
            background: "rgba(218,91,203,0.05)",
          }}
        >
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="font-medium">This wallet becomes the agent's permanent identity.</p>
            <p className="text-xs">
              It will receive payments and sign deliverable submissions. If you
              want a different one, switch accounts in Phantom before connecting.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card/40 p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Agent wallet
            </div>
            <WalletConnect />
          </div>
          {publicKey ? (
            <div className="space-y-2">
              <div className="font-mono text-xs text-muted-foreground break-all">
                {publicKey.toBase58()}
              </div>
              <button
                type="button"
                onClick={() => void disconnect().catch(() => {})}
                className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/80 hover:text-foreground transition-colors"
              >
                Use a different wallet
              </button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No wallet connected. Click the button above to pick which wallet
              this agent will use.
            </p>
          )}
        </div>

        <button
          type="button"
          disabled={!publicKey || step.kind === "signing" || step.kind === "forwarding" || step.kind === "done"}
          onClick={handleAuthorize}
          className="bg-brand-gradient inline-flex w-full items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-medium text-white shadow-violet/30 transition-all duration-200 hover:shadow-violet/50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Sparkles className="h-4 w-4" />
          {step.kind === "loading" && "Loading…"}
          {step.kind === "ready" && (publicKey ? "Sign and authorize" : "Connect a wallet first")}
          {step.kind === "signing" && "Awaiting signature…"}
          {step.kind === "forwarding" && "Sending to CLI…"}
          {step.kind === "done" && "All set"}
          {step.kind === "error" && "Try again"}
        </button>

        {step.kind === "done" && (
          <div className="flex items-start gap-2 rounded-lg border border-green-500/40 bg-green-500/10 p-3 text-sm text-green-200">
            <Check className="h-4 w-4 mt-0.5" />
            <div>
              <p className="font-medium">Authorized.</p>
              <p className="text-xs">You can close this tab and return to your terminal.</p>
            </div>
          </div>
        )}

        {step.kind === "error" && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
            <X className="h-4 w-4 mt-0.5" />
            <span>{step.message}</span>
          </div>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-[560px] px-6 py-12">{children}</main>;
}
