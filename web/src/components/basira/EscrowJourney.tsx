"use client";

import { useEffect, useRef, useState } from "react";
import { Wallet, CircleDollarSign, Check } from "lucide-react";
import { formatAmount } from "@/lib/format";
import { JourneyLine } from "./JourneyLine";

type Verdict = "pass" | "fail" | "unavailable";

export interface EscrowJourneyProps {
  status: string; // created | assigned | submitted | settled | disputed | refunded
  currency: "SOL" | "USDC";
  amount: string;
  verdict: Verdict | null;
  hasDeliverable: boolean;
  /** Play the coins-into-vault animation once (e.g. just funded). */
  justFunded?: boolean;
}

/** Map real task state to the furthest reached stage on the 5-stage spine.
 * Details(0) and Fund(1) are always behind us on the live task page.
 * Review(3) merges delivery + the auto-run judge verdict. */
function reachedIndex(p: EscrowJourneyProps): number {
  if (p.status === "settled") return 4;
  if (p.status === "submitted" || p.hasDeliverable || p.verdict) return 3;
  return 2; // created / assigned / refunded / disputed → escrow
}

export function EscrowJourney(props: EscrowJourneyProps) {
  const { currency, amount, verdict, status } = props;
  const reached = reachedIndex(props);
  const settled = status === "settled";
  const refunded = status === "refunded";

  const prevReached = useRef(reached);
  const [payoutBurst, setPayoutBurst] = useState(false);
  useEffect(() => {
    if (reached > prevReached.current && settled) {
      setPayoutBurst(true);
      const t = setTimeout(() => setPayoutBurst(false), 900);
      prevReached.current = reached;
      return () => clearTimeout(t);
    }
    prevReached.current = reached;
  }, [reached, settled]);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card/40">
      <div className="relative flex items-center justify-center px-6 pt-8 pb-5">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{
            backgroundImage:
              "linear-gradient(rgba(169,120,235,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(169,120,235,0.05) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
            maskImage:
              "radial-gradient(70% 100% at 50% 40%, black 0%, transparent 75%)",
          }}
        />
        <Vault
          {...props}
          settled={settled}
          refunded={refunded}
          payoutBurst={payoutBurst}
        />
      </div>

      <p className="px-6 text-center text-sm text-muted-foreground">
        {captionFor(reached, verdict, settled, refunded)}
        <span className="ml-1 font-mono tabular-nums text-foreground">
          {formatAmount(amount, currency)}
        </span>
      </p>

      <div className="px-6 pb-7 pt-6">
        <JourneyLine
          current={reached}
          failedVerdict={verdict === "fail"}
          settled={settled}
        />
      </div>
    </div>
  );
}

function Vault({
  settled,
  refunded,
  verdict,
  justFunded,
  payoutBurst,
}: EscrowJourneyProps & {
  settled: boolean;
  refunded: boolean;
  payoutBurst: boolean;
}) {
  const holding = !settled && !refunded;
  const showPayout = settled || payoutBurst;

  return (
    <div className="relative flex h-28 w-full items-center justify-center">
      {justFunded && !settled && (
        <div className="coin-drop-in absolute left-1/2 top-2 -translate-x-1/2">
          <Coin />
        </div>
      )}

      <div
        className={`relative flex h-20 w-20 flex-col items-center justify-center rounded-xl border ${
          settled
            ? "border-emerald-400/40 bg-emerald-400/[0.06]"
            : refunded
              ? "border-border bg-card"
              : "border-[#A978EB]/40 bg-[#A978EB]/[0.06] vault-glow"
        }`}
      >
        <div
          className={`absolute left-3 right-3 top-5 h-px ${
            settled ? "bg-emerald-400/40" : "bg-[#A978EB]/40"
          } ${holding ? "vault-latch" : ""}`}
        />
        {settled ? (
          <Check className="h-8 w-8 text-emerald-400" />
        ) : refunded ? (
          <Wallet className="h-7 w-7 text-muted-foreground" />
        ) : (
          <span className={holding ? "coin-shimmer" : ""}>
            <Coin size={28} dim={verdict === "fail"} />
          </span>
        )}
        {!settled && !refunded && (
          <div className="mt-1 h-1.5 w-1.5 rounded-full bg-[#A978EB]/50" />
        )}
      </div>

      {showPayout && (
        <div className="coin-fly-out absolute left-1/2 top-1/2 -translate-y-1/2">
          <Coin size={20} />
        </div>
      )}
    </div>
  );
}

function Coin({ size = 24, dim }: { size?: number; dim?: boolean }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: dim
          ? "radial-gradient(circle at 35% 30%, #6b6b7a, #3a3a44)"
          : "radial-gradient(circle at 35% 30%, #DA5BCB 0%, #A978EB 55%, #4a2a7a 100%)",
        boxShadow: dim ? "none" : "0 0 10px rgba(169,120,235,0.4)",
      }}
    >
      <CircleDollarSign
        style={{ width: size * 0.55, height: size * 0.55, color: "white", opacity: 0.9 }}
      />
    </span>
  );
}

function captionFor(
  reached: number,
  verdict: Verdict | null,
  settled: boolean,
  refunded: boolean,
): string {
  if (refunded) return "Refunded to poster.";
  if (settled) return "Released to the agent.";
  if (verdict === "fail") return "Judge flagged the deliverable. Holding";
  if (verdict === "pass") return "Judge passed it. Awaiting your approval, holding";
  if (reached === 3) return "Deliverable in, judging. Holding";
  return "Locked in escrow, awaiting delivery. Holding";
}
