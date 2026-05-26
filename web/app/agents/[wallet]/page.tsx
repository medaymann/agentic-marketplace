"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Coins,
  Clock,
  Calendar,
  Copy,
} from "lucide-react";
import { Orb } from "@/components/basira/Orb";
import { queryKeys, fetchAgent } from "@/lib/queries";
import { shortenWallet, formatDate } from "@/lib/format";

type AgentDetail = {
  wallet: string;
  name: string;
  description: string;
  capabilities: string;
  capability_tags: string[];
  supported_currencies: string[];
  min_task_reward_usdc: string;
  status: string;
  last_health_check_at: string | null;
  avatar_url: string | null;
  created_at: string;
  completed: number;
  disputed: number;
};

function monthYear(d: string) {
  return new Date(d).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
}

export default function AgentDetailPage({
  params,
}: {
  params: Promise<{ wallet: string }>;
}) {
  const { wallet } = use(params);

  const { data, error: queryError } = useQuery({
    queryKey: queryKeys.agentDetail(wallet),
    queryFn: () => fetchAgent<{ agent: AgentDetail }>(wallet),
  });
  const agent = data?.agent ?? null;
  const error = queryError ? (queryError as Error).message : null;

  const online = agent ? agent.status === "active" : false;
  const minReward = agent
    ? (Number(agent.min_task_reward_usdc) / 1e6).toFixed(2)
    : "0.00";

  return (
    <main className="relative mx-auto max-w-[1100px] px-6 py-10">
      <Link
        href="/agents"
        className="group inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-x-0.5" />
        Back to agents
      </Link>

      {error && <NotFound message={error} />}

      {!agent && !error && <ProfileSkeleton />}

      {agent && (
        <>
          {/* ── Hero banner ──────────────────────────────────────── */}
          <section className="step-enter relative mt-6 overflow-hidden rounded-2xl border border-border bg-card/30">
            {/* atmospheric wash */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(120% 140% at 0% 0%, rgba(169,120,235,0.18) 0%, transparent 55%), radial-gradient(120% 140% at 100% 0%, rgba(218,91,203,0.12) 0%, transparent 55%)",
              }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-[0.5]"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(169,120,235,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(169,120,235,0.05) 1px, transparent 1px)",
                backgroundSize: "32px 32px",
                maskImage:
                  "radial-gradient(80% 100% at 50% 0%, black 0%, transparent 75%)",
              }}
            />

            <div className="relative flex flex-col gap-6 p-7 sm:flex-row sm:items-center sm:justify-between sm:p-8">
              <div className="flex items-center gap-5 min-w-0">
                <div className="relative shrink-0">
                  <div className="gradient-border rounded-full p-[2px]">
                    {agent.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={agent.avatar_url}
                        alt={agent.name}
                        className="h-20 w-20 rounded-full object-cover"
                      />
                    ) : (
                      <Orb size={80} icon={Sparkles} />
                    )}
                  </div>
                  <span
                    className="absolute bottom-1 right-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-[#0c0b14]"
                    style={{ background: online ? "#34d399" : "#4b4b58" }}
                    title={online ? "Online" : "Offline"}
                  >
                    {online && (
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    )}
                  </span>
                </div>

                <div className="min-w-0">
                  <h1 className="truncate text-3xl font-semibold tracking-tight sm:text-4xl">
                    {agent.name}
                  </h1>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <WalletPill wallet={agent.wallet} />
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${
                        online
                          ? "border border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                          : "border border-border text-muted-foreground"
                      }`}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: online ? "#34d399" : "#6b6b7a" }}
                      />
                      {online ? "Online" : "Offline"}
                    </span>
                  </div>
                </div>
              </div>

              <Link
                href={`/tasks/new?assigned=${agent.wallet}`}
                className="bg-brand-gradient group inline-flex shrink-0 items-center gap-1.5 rounded-xl px-5 py-3 text-sm font-medium text-white shadow-violet/30 transition-all duration-200 hover:scale-[1.03] hover:shadow-violet/50 active:scale-95"
              >
                Hire this agent
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            </div>
          </section>

          {/* ── Body: narrative + command rail ───────────────────── */}
          <div className="mt-7 grid grid-cols-1 gap-7 lg:grid-cols-3">
            {/* Left — narrative */}
            <div
              className="step-enter space-y-7 lg:col-span-2"
              style={{ animationDelay: "60ms" }}
            >
              {agent.description && (
                <Section title="About">
                  <p className="text-[15px] leading-relaxed text-foreground/90 whitespace-pre-wrap">
                    {agent.description}
                  </p>
                </Section>
              )}

              {agent.capabilities && (
                <Section title="Capabilities">
                  <p className="text-[15px] leading-relaxed text-foreground/90 whitespace-pre-wrap">
                    {agent.capabilities}
                  </p>
                </Section>
              )}

              {agent.capability_tags.length > 0 && (
                <Section title="Specialties">
                  <div className="flex flex-wrap gap-2">
                    {agent.capability_tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-lg border border-border bg-card/40 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition-colors hover:border-[#A978EB]/40 hover:text-foreground"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </Section>
              )}

              {!agent.description &&
                !agent.capabilities &&
                agent.capability_tags.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border bg-card/20 px-6 py-12 text-center text-sm text-muted-foreground">
                    This agent hasn’t added a profile description yet.
                  </div>
                )}
            </div>

            {/* Right — sticky command rail */}
            <aside
              className="step-enter lg:col-span-1"
              style={{ animationDelay: "120ms" }}
            >
              <div className="lg:sticky lg:top-6 space-y-4">
                {/* Track record */}
                <div className="rounded-xl border border-border bg-card/40 p-5">
                  <h2 className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                    Track record
                  </h2>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <StatTile
                      icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                      value={agent.completed}
                      label="Completed"
                    />
                    <StatTile
                      icon={<AlertTriangle className="h-4 w-4 text-orange-400" />}
                      value={agent.disputed}
                      label="Disputed"
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between rounded-lg border border-[#A978EB]/20 bg-[#A978EB]/[0.06] px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Coins className="h-4 w-4 text-[#c8a8f5]" />
                      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        Min reward
                      </span>
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {minReward} USDC
                    </span>
                  </div>
                </div>

                {/* Payment */}
                {agent.supported_currencies.length > 0 && (
                  <div className="rounded-xl border border-border bg-card/40 p-5">
                    <h2 className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                      Accepted payment
                    </h2>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {agent.supported_currencies.map((c) => (
                        <span
                          key={c}
                          className="rounded-lg border border-border bg-background/40 px-3 py-1.5 font-mono text-xs text-foreground"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Metadata */}
                <div className="rounded-xl border border-border bg-card/40 p-5">
                  <h2 className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                    Details
                  </h2>
                  <dl className="mt-3 space-y-3 text-sm">
                    <MetaRow
                      icon={<Calendar className="h-3.5 w-3.5" />}
                      label="Member since"
                      value={monthYear(agent.created_at)}
                    />
                    <MetaRow
                      icon={<Clock className="h-3.5 w-3.5" />}
                      label="Last seen"
                      value={
                        agent.last_health_check_at
                          ? formatDate(agent.last_health_check_at)
                          : "—"
                      }
                    />
                  </dl>
                </div>
              </div>
            </aside>
          </div>
        </>
      )}
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
        {title}
        <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
      </h2>
      {children}
    </section>
  );
}

function StatTile({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <div className="flex items-center gap-1.5">{icon}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
        {value}
      </div>
      <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function MetaRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex items-center gap-2 text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="truncate font-mono text-xs text-foreground">{value}</dd>
    </div>
  );
}

function WalletPill({ wallet }: { wallet: string }) {
  return (
    <button
      onClick={() => navigator.clipboard?.writeText(wallet)}
      className="group inline-flex items-center gap-1.5 rounded-full border border-border bg-card/40 px-3 py-1 font-mono text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
      title="Copy full address"
    >
      {shortenWallet(wallet)}
      <Copy className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

function NotFound({ message }: { message: string }) {
  return (
    <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card/20 px-6 py-20 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10">
        <AlertTriangle className="h-5 w-5 text-red-300" />
      </div>
      <p className="text-sm font-medium text-foreground">Agent unavailable</p>
      <p className="max-w-xs text-sm text-muted-foreground">{message}</p>
      <Link
        href="/agents"
        className="mt-1 rounded-lg border border-border px-3.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
      >
        Browse agents
      </Link>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="mt-6 animate-pulse">
      <div className="flex items-center gap-5 rounded-2xl border border-border bg-card/30 p-8">
        <div className="h-20 w-20 rounded-full bg-card" />
        <div className="space-y-3">
          <div className="h-7 w-48 rounded bg-card" />
          <div className="h-4 w-32 rounded bg-card" />
        </div>
      </div>
      <div className="mt-7 grid grid-cols-1 gap-7 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="h-4 w-24 rounded bg-card" />
          <div className="h-3 w-full rounded bg-card" />
          <div className="h-3 w-5/6 rounded bg-card" />
          <div className="h-3 w-4/6 rounded bg-card" />
        </div>
        <div className="space-y-4">
          <div className="h-40 rounded-xl border border-border bg-card/40" />
          <div className="h-28 rounded-xl border border-border bg-card/40" />
        </div>
      </div>
    </div>
  );
}
