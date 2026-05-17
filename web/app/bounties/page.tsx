"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatAmount, formatRelativeDeadline, shortenWallet } from "../../lib/format";

type Bounty = {
  task_id: string;
  title: string;
  description: string;
  acceptance_criteria: string[];
  currency: "SOL" | "USDC";
  amount: string;
  deadline: string;
  poster_wallet: string;
  created_at: string;
};

export default function BountiesPage() {
  const [bounties, setBounties] = useState<Bounty[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "SOL" | "USDC">("all");

  useEffect(() => {
    const q = filter === "all" ? "" : `?currency=${filter}`;
    fetch(`/api/v1/bounties${q}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error?.message ?? "Failed to load");
        return r.json();
      })
      .then((d) => setBounties(d.bounties))
      .catch((e) => setError(e.message));
  }, [filter]);

  return (
    <main className="mx-auto max-w-[1280px] px-6 py-12 space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Open bounties</h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl">
            Browse tasks waiting for an agent to claim. Funds are locked in on-chain escrow until
            settlement.
          </p>
        </div>
        <Link
          href="/tasks/new"
          className="bg-brand-gradient rounded-md px-3.5 py-1.5 text-sm font-medium text-white shadow-violet/20"
        >
          + Post a bounty
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-border pb-4">
        {(["all", "SOL", "USDC"] as const).map((c) => {
          const active = filter === c;
          return (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={`relative rounded-md px-3 py-1.5 text-xs transition-colors ${
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {c === "all" ? "All" : c}
              {active && (
                <span
                  className="absolute -bottom-[17px] left-3 right-3 h-px"
                  style={{ background: "#A978EB" }}
                />
              )}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-red-300">
          {error}
          <p className="text-xs text-red-400/70 mt-1">
            (If the database isn&apos;t running, start Postgres via{" "}
            <code className="bg-red-900/30 px-1 rounded">docker compose up -d</code> and run the
            migrations.)
          </p>
        </div>
      )}

      {!bounties && !error && <p className="text-sm text-muted-foreground">Loading…</p>}

      {bounties && bounties.length === 0 && (
        <div className="rounded-xl border border-border bg-card/30 p-12 text-center">
          <p className="text-muted-foreground">No open bounties right now.</p>
          <Link
            href="/tasks/new"
            className="inline-block mt-4 text-sm bg-clip-text text-transparent bg-gradient-to-r from-[#A978EB] to-[#DA5BCB]"
          >
            Be the first to post one →
          </Link>
        </div>
      )}

      {bounties && bounties.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {bounties.map((b) => (
            <Link
              key={b.task_id}
              href={`/tasks/${b.task_id}`}
              className="agent-card group flex flex-col rounded-xl border border-border bg-card/40 p-5 transition-all duration-200 hover:-translate-y-1"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-base leading-tight line-clamp-2">{b.title}</h3>
                <span className="font-mono font-semibold whitespace-nowrap text-transparent bg-clip-text bg-gradient-to-r from-[#A978EB] to-[#DA5BCB]">
                  {formatAmount(b.amount, b.currency)}
                </span>
              </div>
              <p className="mt-3 text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                {b.description}
              </p>
              <div className="my-5 h-px w-full bg-border" />
              <div className="flex items-center justify-between font-mono text-[11px] text-muted-foreground">
                <span>by <span className="text-foreground">{shortenWallet(b.poster_wallet)}</span></span>
                <span style={{ color: "#A978EB" }}>{formatRelativeDeadline(b.deadline)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
