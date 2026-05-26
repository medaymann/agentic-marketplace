"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Orb } from "./Orb";
import { shortenWallet } from "@/lib/format";

export interface Agent {
  name: string;
  wallet: string;
  description: string;
  tags: string[];
  completed: number;
  disputed: number;
  acceptance: number;
  minReward: number;
  currencies?: string[];
  highlighted?: boolean;
  hireHref?: string;
  detailHref?: string;
  icon?: LucideIcon;
  status?: "active" | "inactive" | "online";
  avatarUrl?: string | null;
}

function Metric({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="flex flex-col items-center px-2 py-2.5 text-center">
      <span className="text-sm font-semibold tabular-nums leading-none text-foreground">
        {value}
      </span>
      <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

export function AgentCard({ agent }: { agent: Agent }) {
  const online = agent.status !== "inactive";
  const router = useRouter();
  const clickable = Boolean(agent.detailHref);

  return (
    <div
      {...(agent.detailHref
        ? {
            role: "link" as const,
            tabIndex: 0,
            onClick: () => router.push(agent.detailHref!),
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                router.push(agent.detailHref!);
              }
            },
          }
        : {})}
      className={`agent-card group flex h-full flex-col rounded-xl border border-border bg-card/40 p-5 transition-all duration-300 hover:-translate-y-1 hover:border-foreground/20 hover:bg-card/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A978EB]/60 ${
        clickable ? "cursor-pointer" : ""
      }`}
    >
      {/* Identity */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative shrink-0">
            {agent.avatarUrl ? (
              <img
                src={agent.avatarUrl}
                alt={agent.name}
                className="h-11 w-11 rounded-full object-cover ring-1 ring-[#A978EB]/30 transition-shadow duration-300 group-hover:ring-[#A978EB]/60"
              />
            ) : (
              <Orb size={44} {...(agent.icon ? { icon: agent.icon } : {})} />
            )}
            <span
              className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0c0b14]"
              style={{ background: online ? "#34d399" : "#4b4b58" }}
              title={online ? "Online" : "Offline"}
            />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold leading-tight">
              {agent.name}
            </div>
            <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
              {shortenWallet(agent.wallet)}
            </div>
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] ${
            online
              ? "border border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
              : "border border-border text-muted-foreground"
          }`}
        >
          {online ? "Online" : "Offline"}
        </span>
      </div>

      {/* Description */}
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground line-clamp-2">
        {agent.description}
      </p>

      {/* Tags */}
      {agent.tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {agent.tags.slice(0, 4).map((t) => (
            <span
              key={t}
              className="rounded-md border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors group-hover:border-foreground/20"
            >
              {t}
            </span>
          ))}
          {agent.tags.length > 4 && (
            <span className="px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
              +{agent.tags.length - 4}
            </span>
          )}
        </div>
      )}

      {/* Metrics panel */}
      <div className="mt-5 grid grid-cols-3 divide-x divide-border rounded-lg border border-border bg-background/40">
        <Metric value={agent.completed} label="Done" />
        <Metric value={agent.disputed} label="Disputed" />
        <Metric value={`${agent.acceptance}%`} label="Accept" />
      </div>

      {/* Footer */}
      <div className="mt-auto flex items-end justify-between pt-5">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Min reward
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-base font-semibold tabular-nums text-foreground">
              {agent.minReward}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {agent.currencies && agent.currencies.length > 0
                ? agent.currencies.join(" · ")
                : "USDC"}
            </span>
          </div>
        </div>
        {agent.hireHref ? (
          <Link
            href={agent.hireHref}
            onClick={(e) => e.stopPropagation()}
            className="bg-brand-gradient inline-flex shrink-0 items-center gap-1 rounded-lg px-3.5 py-2 text-xs font-medium text-white shadow-violet/20 transition-all duration-200 hover:scale-105 hover:shadow-violet/40 active:scale-95"
          >
            Hire
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
