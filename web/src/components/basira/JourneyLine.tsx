"use client";

import {
  PenLine,
  Wallet,
  Lock,
  Scale,
  CircleDollarSign,
  Check,
  X,
  type LucideIcon,
} from "lucide-react";

export type JourneyStageKey =
  | "details"
  | "fund"
  | "escrow"
  | "review"
  | "settled";

export const JOURNEY_STAGES: {
  key: JourneyStageKey;
  label: string;
  icon: LucideIcon;
}[] = [
  { key: "details", label: "Details", icon: PenLine },
  { key: "fund", label: "Fund", icon: Wallet },
  { key: "escrow", label: "Escrow", icon: Lock },
  { key: "review", label: "Review", icon: Scale },
  { key: "settled", label: "Settled", icon: CircleDollarSign },
];

/**
 * The shared horizontal spine. `current` is the active stage (0-based index
 * into JOURNEY_STAGES). Stages before it render done; the current one pulses.
 * `failedVerdict` flips the verdict node to a red X.
 */
export function JourneyLine({
  current,
  failedVerdict,
  settled,
}: {
  current: number;
  failedVerdict?: boolean;
  settled?: boolean;
}) {
  const fillPct = (current / (JOURNEY_STAGES.length - 1)) * 100;

  return (
    <div className="relative">
      <div className="absolute left-0 right-0 top-[11px] h-0.5 rounded-full bg-border" />
      <div
        className="journey-fill absolute left-0 top-[11px] h-0.5 rounded-full"
        style={{
          width: `${fillPct}%`,
          background: "linear-gradient(to right, #A978EB, #DA5BCB)",
        }}
      />
      <ol className="relative flex items-start justify-between">
        {JOURNEY_STAGES.map((s, i) => {
          const done = i < current || (i === current && settled);
          const active = i === current && !settled;
          const failHere = s.key === "review" && failedVerdict;
          const Icon = s.icon;
          return (
            <li key={s.key} className="flex flex-col items-center gap-2" style={{ width: 0 }}>
              <span
                key={`${s.key}-${i <= current}`}
                className={`flex h-6 w-6 items-center justify-center rounded-full border transition-colors ${
                  i <= current ? "journey-node-active" : ""
                } ${
                  failHere
                    ? "border-[#F87171]/60 bg-[#F87171]/15 text-[#F87171]"
                    : i <= current
                      ? "border-transparent bg-brand-gradient text-white"
                      : "border-border bg-card text-muted-foreground"
                }`}
              >
                {failHere ? (
                  <X className="h-3 w-3" />
                ) : done ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <Icon className={`h-3 w-3 ${active ? "waiting-pulse" : ""}`} />
                )}
              </span>
              <span
                className={`whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.1em] ${
                  i <= current ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {s.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
