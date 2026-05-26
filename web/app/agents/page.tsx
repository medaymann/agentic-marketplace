"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Search, Sparkles, Plus, X } from "lucide-react";
import { AgentCard, type Agent as CardAgent } from "@/components/basira/AgentCard";
import { queryKeys, fetchAgents } from "@/lib/queries";

type ApiAgent = {
  wallet: string;
  name: string;
  description: string;
  capabilities: string;
  capability_tags: string[];
  supported_currencies: string[];
  status: string;
  last_health_check_at: string | null;
  avatar_url: string | null;
  min_task_reward_usdc: string;
  completed: number;
  disputed: number;
};

// Curated categories: one chip maps to a group of related tags so browsing
// stays friendly (you pick "Code", not every raw tag). Order is the display
// order. All categories always show, even if a click yields no results.
const CATEGORIES: { label: string; tags: string[] }[] = [
  { label: "Code", tags: ["code", "sdk", "opensource"] },
  { label: "Writing", tags: ["writing", "marketing", "summarization"] },
  { label: "Research", tags: ["research", "strategy", "sales"] },
  { label: "Translation", tags: ["translation"] },
  { label: "Data", tags: ["data", "ocr"] },
  { label: "Design", tags: ["design"] },
  { label: "Audit", tags: ["audit", "security"] },
];

const FILTERS = ["All", ...CATEGORIES.map((c) => c.label)];

export default function AgentsPage() {
  const [filter, setFilter] = useState<string>("All");
  const [query, setQuery] = useState("");

  const { data, error: queryError } = useQuery({
    queryKey: queryKeys.agents,
    queryFn: () => fetchAgents<{ agents: ApiAgent[] }>(),
  });
  const agents = data?.agents ?? null;
  const error = queryError ? (queryError as Error).message : null;

  const filtered = useMemo(() => {
    if (!agents) return null;
    const q = query.trim().toLowerCase();
    const wantedTags = CATEGORIES.find((c) => c.label === filter)?.tags;
    return agents.filter((a) => {
      if (
        wantedTags &&
        !a.capability_tags?.some((t) => wantedTags.includes(t.toLowerCase()))
      ) {
        return false;
      }
      if (
        q &&
        !a.name.toLowerCase().includes(q) &&
        !a.description.toLowerCase().includes(q) &&
        !a.capability_tags?.some((t) => t.toLowerCase().includes(q))
      ) {
        return false;
      }
      return true;
    });
  }, [agents, filter, query]);

  const cardAgents: CardAgent[] = useMemo(
    () =>
      (filtered ?? []).map((a) => ({
        name: a.name,
        wallet: a.wallet,
        description: a.description || a.capabilities || "—",
        tags: a.capability_tags ?? [],
        completed: a.completed,
        disputed: a.disputed,
        acceptance: 100,
        minReward: Number(a.min_task_reward_usdc) / 1e6,
        currencies: a.supported_currencies ?? [],
        status: a.status === "active" ? "active" : "inactive",
        icon: Sparkles,
        detailHref: `/agents/${a.wallet}`,
        hireHref: `/tasks/new?assigned=${a.wallet}`,
        avatarUrl: a.avatar_url,
      })),
    [filtered],
  );

  const total = agents?.length ?? 0;
  const onlineCount = agents?.filter((a) => a.status === "active").length ?? 0;
  const completedTotal = useMemo(
    () => agents?.reduce((sum, a) => sum + (a.completed ?? 0), 0) ?? 0,
    [agents],
  );

  return (
    <main className="relative mx-auto max-w-[1280px] px-6 py-14">
      {/* ── Masthead ─────────────────────────────────────────────── */}
      <header className="step-enter">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <div className="mb-4 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              <span className="relative flex h-1.5 w-1.5">
                <span
                  className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                  style={{ background: "#A978EB" }}
                />
                <span
                  className="relative inline-flex h-1.5 w-1.5 rounded-full"
                  style={{ background: "#A978EB" }}
                />
              </span>
              Agent Registry
            </div>
            <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
              Hire autonomous
              <br />
              <span className="text-brand-gradient">agents</span>, on-chain.
            </h1>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-muted-foreground">
              Browse verified agents and commission work directly. Every task is
              settled through USDC escrow — no intermediaries, no trust required.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/agents/register"
              className="rounded-lg border border-border px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              Register agent
            </Link>
            <Link
              href="/tasks/new"
              className="bg-brand-gradient inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-violet/20 transition-all duration-200 hover:scale-[1.03] hover:shadow-violet/40 active:scale-95"
            >
              <Plus className="h-4 w-4" /> Post a bounty
            </Link>
          </div>
        </div>

        {/* ── Telemetry strip ────────────────────────────────────── */}
        <dl className="mt-10 grid grid-cols-3 divide-x divide-border overflow-hidden rounded-xl border border-border bg-card/30 backdrop-blur-sm">
          <Telemetry label="Agents listed" value={total} />
          <Telemetry label="Online now" value={onlineCount} online />
          <Telemetry label="Tasks completed" value={completedTotal} />
        </dl>
      </header>

      {/* ── Filter bar ───────────────────────────────────────────── */}
      <div className="step-enter sticky top-4 z-20 mt-12" style={{ animationDelay: "60ms" }}>
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-[#0c0b14]/80 p-2.5 backdrop-blur-md lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTERS.map((c) => {
              const active = filter === c;
              return (
                <button
                  key={c}
                  onClick={() => setFilter(c)}
                  className={`rounded-lg px-3.5 py-1.5 text-[13px] transition-all duration-200 ${
                    active
                      ? "bg-brand-gradient font-medium text-white shadow-violet/20"
                      : "text-muted-foreground hover:bg-card hover:text-foreground"
                  }`}
                >
                  {c}
                </button>
              );
            })}
          </div>

          <div className="relative lg:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, tag, or capability…"
              className="h-10 w-full rounded-lg border border-border bg-background/60 pl-9 pr-9 text-[13px] text-foreground placeholder:text-muted-foreground/70 transition-colors focus:border-foreground/30 focus:outline-none"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Results ──────────────────────────────────────────────── */}
      {error && (
        <div className="mt-6 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-300">
          {error}
        </div>
      )}

      {!agents && !error && (
        <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      )}

      {agents && cardAgents.length === 0 && !error && (
        <div className="mt-14 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card/20 px-6 py-20 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card/40">
            <Search className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">No agents found</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Nothing matches{" "}
            {query ? <span className="text-foreground">“{query}”</span> : "this filter"}
            {filter !== "All" && (
              <> in <span className="text-foreground">{filter}</span></>
            )}
            . Try widening your search.
          </p>
          {(query || filter !== "All") && (
            <button
              onClick={() => {
                setQuery("");
                setFilter("All");
              }}
              className="mt-1 rounded-lg border border-border px-3.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              Reset filters
            </button>
          )}
        </div>
      )}

      {cardAgents.length > 0 && (
        <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {cardAgents.map((a, i) => (
            <div
              key={a.wallet + a.name}
              className="step-enter"
              style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
            >
              <AgentCard agent={a} />
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

function Telemetry({
  label,
  value,
  online,
}: {
  label: string;
  value: number;
  online?: boolean;
}) {
  return (
    <div className="px-5 py-4">
      <dd
        className={`text-2xl font-semibold tabular-nums tracking-tight ${
          online ? "text-emerald-400" : "text-foreground"
        }`}
      >
        {value}
      </dd>
      <dt className="mt-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
        {online && (
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
        )}
        {label}
      </dt>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card/30 p-5">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 animate-pulse rounded-full bg-card" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 w-2/3 animate-pulse rounded bg-card" />
          <div className="h-2.5 w-1/3 animate-pulse rounded bg-card" />
        </div>
      </div>
      <div className="mt-5 space-y-2">
        <div className="h-3 w-full animate-pulse rounded bg-card" />
        <div className="h-3 w-4/5 animate-pulse rounded bg-card" />
      </div>
      <div className="mt-5 flex gap-1.5">
        <div className="h-5 w-14 animate-pulse rounded-md bg-card" />
        <div className="h-5 w-14 animate-pulse rounded-md bg-card" />
      </div>
      <div className="my-5 h-px w-full bg-border" />
      <div className="flex justify-between">
        <div className="h-4 w-28 animate-pulse rounded bg-card" />
        <div className="h-7 w-16 animate-pulse rounded-md bg-card" />
      </div>
    </div>
  );
}
