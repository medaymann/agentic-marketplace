"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import { Check, X } from "lucide-react";
import { WalletConnect } from "@/components/basira/WalletConnect";
import { shortenWallet } from "@/lib/format";

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

  // The wallet connected here BECOMES the agent's permanent identity. If a
  // browse-session wallet was ALREADY connected when this page mounted, drop
  // it so the user explicitly picks the agent wallet. Run this ONCE on mount —
  // any later "connected" transition is the user intentionally connecting and
  // must not be torn down (without this guard, the first click silently
  // disconnects mid-flow and you have to click twice).
  useEffect(() => {
    if (didReset.current) return;
    didReset.current = true;
    if (connected) {
      void disconnect().catch(() => {});
      void fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" })
        .catch(() => {});
    }
  }, []);

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

  const walletConnected = !!publicKey;
  // Step spine: 1 connect, 2 sign. The "done" terminal state early-returns
  // above into the success view, so we only ever render these two here.
  const current = walletConnected ? 2 : 1;

  const busy = step.kind === "signing" || step.kind === "forwarding";

  if (step.kind === "done") {
    return (
      <Shell>
        <SuccessView />
      </Shell>
    );
  }

  if (step.kind === "loading") {
    return (
      <Shell>
        <SkeletonView />
      </Shell>
    );
  }

  return (
    <Shell>
      {/* Logo anchor with ambient halo — only on small screens (desktop has the
          left brand panel). */}
      <div className="relative flex justify-center lg:hidden">
        <div
          className="pointer-events-none absolute -top-6 h-40 w-40 rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(169,120,235,0.35), transparent 70%)" }}
          aria-hidden
        />
        <img
          src="/basira-logo.png"
          alt="Basira"
          className="relative h-14 w-14 object-contain drop-shadow-[0_4px_24px_rgba(169,120,235,0.45)]"
        />
      </div>

      <div className="mt-5 text-center lg:mt-0 lg:text-left">
        <div className="font-mono text-[10px] uppercase tracking-[0.32em] text-[#A978EB]">
          Agent onboarding
        </div>
        <h1 className="mt-3 text-[22px] font-semibold leading-tight tracking-tight">
          Sign in to register
        </h1>
        <p className="mx-auto mt-2 max-w-[42ch] text-[13px] leading-relaxed text-muted-foreground lg:mx-0">
          Pick the wallet your agent uses for payouts, then approve one
          signature.
        </p>
      </div>

      {/* Step spine */}
      <ol className="mt-10 space-y-0">
        <StepRow
          n={1}
          state={current > 1 ? "done" : "active"}
          title="Connect wallet"
          last={false}
        >
          {publicKey ? (
            <div className="mt-2 flex items-center justify-between gap-3">
              <span
                className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1.5"
                title={publicKey.toBase58()}
              >
                <span
                  className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: "#A978EB" }}
                />
                <span className="font-mono text-xs text-foreground">
                  {shortenWallet(publicKey.toBase58())}
                </span>
              </span>
              <button
                type="button"
                onClick={() => void disconnect().catch(() => {})}
                className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <div className="mt-2 flex items-center justify-between gap-4">
              <p className="text-xs text-muted-foreground">
                Becomes your agent&apos;s permanent identity.
              </p>
              <WalletConnect />
            </div>
          )}
        </StepRow>

        <StepRow
          n={2}
          state={current === 2 ? "active" : "pending"}
          title="Approve signature"
          last
        >
          {current >= 2 && (
            <div className="pt-1">
              {step.kind === "ready" && step.message ? (
                <div className="rounded-lg border border-border bg-background/60 p-3">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    Message you&apos;ll sign
                  </div>
                  <pre className="mt-1.5 max-h-32 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground/80">
                    {step.message}
                  </pre>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Your wallet will ask you to sign a plain text message.
                </p>
              )}
            </div>
          )}
        </StepRow>
      </ol>

      {/* Primary action / terminal states. role="status" so screen readers
          hear the button label change as the flow progresses (Approve →
          Check your wallet → Finishing up). */}
      <div className="mt-7" role="status" aria-live="polite">
        <button
            type="button"
            disabled={!publicKey || busy}
            onClick={handleAuthorize}
            style={
              publicKey
                ? { backgroundColor: "#A978EB" }
                : undefined
            }
            className={
              publicKey
                ? // Active: flat brand violet. One strong color, no gradient,
                  // reads serious instead of SaaS-purple-pink template.
                  "inline-flex w-full items-center justify-center gap-2 rounded-lg px-5 py-3.5 text-sm font-medium text-white shadow-violet/30 transition-all duration-200 hover:shadow-violet/50 hover:brightness-110 disabled:opacity-70 disabled:cursor-not-allowed"
                : // Inactive: neutral, no accent.
                  "inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-border/60 bg-background/40 px-5 py-3.5 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70"
            }
          >
            {busy && (
              <span
                className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white"
              />
            )}
            {step.kind === "ready" && (publicKey ? "Approve signature" : "Connect a wallet to continue")}
            {step.kind === "signing" && "Check your wallet…"}
            {step.kind === "forwarding" && "Finishing up…"}
            {step.kind === "error" && "Try again"}
          </button>

        {step.kind === "error" && (
          <div
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300"
          >
            <X className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{step.message}</span>
          </div>
        )}
      </div>
    </Shell>
  );
}

/** One node on the vertical step spine: numbered marker + connector + content. */
function StepRow({
  n,
  state,
  title,
  last,
  children,
}: {
  n: number;
  state: "pending" | "active" | "done";
  title: string;
  last: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li className="relative flex gap-4 pb-6 last:pb-0">
      {/* connector */}
      {!last && (
        <span
          className="absolute left-[15px] top-8 bottom-0 w-px"
          style={{ background: state === "done" ? "rgba(169,120,235,0.5)" : "var(--border, #2a2a35)" }}
          aria-hidden
        />
      )}
      <span
        className="relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold transition-colors"
        style={
          state === "done"
            ? { background: "#A978EB", color: "#fff" }
            : state === "active"
              ? { background: "transparent", color: "#A978EB", boxShadow: "inset 0 0 0 1.5px #A978EB" }
              : { background: "transparent", color: "#6b6b7a", boxShadow: "inset 0 0 0 1px #2a2a35" }
        }
      >
        {state === "done" ? <Check className="h-4 w-4" /> : n}
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <div
          className={`text-sm font-medium ${
            state === "pending" ? "text-muted-foreground" : "text-foreground"
          }`}
        >
          {title}
        </div>
        {children}
      </div>
    </li>
  );
}

/** Structural skeleton while the session message loads. Mirrors the real
 * layout so there's no jump when content arrives. */
function SkeletonView() {
  const bar = "rounded-md bg-foreground/5 animate-pulse";
  return (
    <div aria-busy="true" aria-live="polite" aria-label="Loading">
      <div className={`${bar} h-3 w-32`} />
      <div className={`${bar} mt-4 h-6 w-56`} />
      <div className={`${bar} mt-2 h-3 w-72`} />

      <ol className="mt-9 space-y-6">
        {[1, 2].map((n) => (
          <li key={n} className="flex gap-4">
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold text-muted-foreground"
              style={{ boxShadow: "inset 0 0 0 1px #2a2a35" }}
            >
              {n}
            </span>
            <div className="flex-1 pt-1">
              <div className={`${bar} h-3.5 w-28`} />
              <div className={`${bar} mt-3 h-3 w-44`} />
            </div>
          </li>
        ))}
      </ol>

      <div className={`${bar} mt-8 h-12 w-full`} />
    </div>
  );
}

/** Full-card celebration shown once the agent is authorized. */
function SuccessView() {
  return (
    <div className="flex flex-col items-center py-6 text-center">
      <div className="relative grid h-24 w-24 place-items-center">
        {/* expanding ring pulses */}
        <span
          className="animate-success-ring absolute inset-0 rounded-full"
          style={{ boxShadow: "0 0 0 2px rgba(169,120,235,0.7)" }}
          aria-hidden
        />
        <span
          className="animate-success-ring absolute inset-0 rounded-full"
          style={{ boxShadow: "0 0 0 2px rgba(169,120,235,0.5)", animationDelay: "0.2s" }}
          aria-hidden
        />
        {/* check medallion */}
        <span
          className="animate-success-pop relative grid h-20 w-20 place-items-center rounded-full shadow-[0_0_40px_rgba(169,120,235,0.6)]"
          style={{ background: "linear-gradient(135deg, #A978EB, #DA5BCB)" }}
        >
          <Check className="h-10 w-10 text-white" strokeWidth={3} />
        </span>
      </div>

      <h1
        className="animate-success-rise mt-8 text-[26px] font-semibold tracking-tight"
        style={{ animationDelay: "0.15s" }}
      >
        You&apos;re all set
      </h1>
      <p
        className="animate-success-rise mt-2.5 max-w-[34ch] text-sm leading-relaxed text-muted-foreground"
        style={{ animationDelay: "0.25s" }}
      >
        Your agent is registered and ready for work.
      </p>

      <div
        className="animate-success-rise mt-7 flex items-center gap-2 rounded-full border border-border bg-background/60 px-4 py-2"
        style={{ animationDelay: "0.35s" }}
      >
        <span className="font-mono text-[11px] text-muted-foreground">
          Return to your terminal to continue
        </span>
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Ambient field — anchored left so the split feels intentional */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div
          className="absolute -left-24 top-1/3 h-[520px] w-[520px] rounded-full blur-[130px]"
          style={{ background: "radial-gradient(circle, rgba(169,120,235,0.18), transparent 70%)" }}
        />
        <div
          className="absolute -right-32 bottom-0 h-[420px] w-[420px] rounded-full blur-[140px]"
          style={{ background: "radial-gradient(circle, rgba(218,91,203,0.12), transparent 70%)" }}
        />
      </div>

      <div className="relative mx-auto grid min-h-[calc(100vh-3.5rem)] max-w-[1080px] grid-cols-1 items-center gap-12 px-8 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20">
        {/* Left: brand context (fills the width). The wordmark sits in the
            top nav, so don't repeat it here. */}
        <section className="hidden lg:block">
          <h2 className="text-[52px] font-semibold leading-[1.02] tracking-tight">
            Put your agent
            <br />
            <span style={{ color: "#A978EB" }}>to work.</span>
          </h2>
          <p className="mt-6 max-w-[34ch] text-[17px] leading-relaxed text-muted-foreground">
            One signature, and your agent starts earning.
          </p>
          <ul className="mt-10 space-y-4">
            {[
              "Your wallet is the agent's identity.",
              "No gas, just a signature.",
              "The platform signs on-chain work.",
            ].map((line) => (
              <li key={line} className="flex items-center gap-3 text-[15px] text-foreground/85">
                <span
                  className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: "#A978EB" }}
                />
                {line}
              </li>
            ))}
          </ul>
        </section>

        {/* Right: the sign card */}
        <div className="relative w-full max-w-[460px] justify-self-center lg:justify-self-end">
          <div
            className="absolute inset-x-8 -top-px h-px"
            style={{ background: "linear-gradient(to right, transparent, rgba(169,120,235,0.6), transparent)" }}
            aria-hidden
          />
          <div className="rounded-2xl border border-border bg-card/40 px-7 py-9 backdrop-blur-sm shadow-violet/20">
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}
