"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import {
  Lock,
  X,
  Check,
  Sparkles,
  ShieldCheck,
  PenLine,
  Radio,
  CircleCheck,
  Wallet,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import { Orb } from "@/components/basira/Orb";
import { JourneyLine } from "@/components/basira/JourneyLine";
import { shortenWallet } from "@/lib/format";

type Step = "form" | "signing" | "confirming" | "done";
type Mode = "bounty" | "direct";

const TAG_OPTIONS = [
  "writing",
  "code",
  "data",
  "design",
  "research",
  "summarization",
  "translation",
  "qa",
];

export default function NewTaskPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-[760px] px-6 py-12">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </main>
      }
    >
      <NewTaskInner />
    </Suspense>
  );
}

function NewTaskInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();

  // If ?assigned= is in the URL we're in direct mode, otherwise bounty
  const [mode] = useState<Mode>(() =>
    searchParams?.get("assigned") ? "direct" : "bounty",
  );

  const [currency, setCurrency] = useState<"SOL" | "USDC">("SOL");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [criteriaText, setCriteriaText] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [amount, setAmount] = useState("0.01");
  const [deadlineDate, setDeadlineDate] = useState(() => {
    const d = new Date(Date.now() + 180 * 60 * 1000);
    return d.toISOString().slice(0, 16);
  });

  // Direct mode state
  const [assignedAgent, setAssignedAgent] = useState("");
  const [resolvedAgent, setResolvedAgent] = useState<{
    wallet: string;
    name: string;
    avatarUrl: string | null;
  } | null>(null);
  const [agentInputSchema, setAgentInputSchema] =
    useState<JsonSchemaObject | null>(null);
  const [agentLookupError, setAgentLookupError] = useState<string | null>(null);
  const [typedInputs, setTypedInputs] = useState<Record<string, unknown>>({});

  const [step, setStep] = useState<Step>("form");
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);

  // Pre-fill from agents page deep-link
  useEffect(() => {
    const assigned = searchParams?.get("assigned");
    if (assigned) setAssignedAgent(assigned);
  }, [searchParams]);

  // Resolve agent wallet → name + avatar + input schema
  useEffect(() => {
    if (mode !== "direct" || !assignedAgent || assignedAgent.length < 32) {
      setResolvedAgent(null);
      setAgentInputSchema(null);
      setAgentLookupError(null);
      return;
    }
    let cancelled = false;
    setAgentLookupError(null);
    setResolvedAgent(null);
    setAgentInputSchema(null);
    (async () => {
      try {
        const [schemaRes, profileRes] = await Promise.all([
          fetch(`/api/v1/agents/${assignedAgent}/schema`),
          fetch(`/api/v1/agents/${assignedAgent}`),
        ]);
        if (cancelled) return;
        if (!schemaRes.ok) {
          if (schemaRes.status === 404)
            setAgentLookupError("This wallet is not a registered agent.");
          return;
        }
        const json = await schemaRes.json();
        const profile = profileRes.ok ? await profileRes.json() : null;
        if (cancelled) return;
        setResolvedAgent({
          wallet: assignedAgent,
          name: json.name,
          avatarUrl: profile?.agent?.avatar_url ?? null,
        });
        if (json.inputSchema && typeof json.inputSchema === "object") {
          setAgentInputSchema(json.inputSchema as JsonSchemaObject);
          setTypedInputs({});
        }
      } catch {
        // soft-fail
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, assignedAgent]);

  function clearAgent() {
    setAssignedAgent("");
    setResolvedAgent(null);
    setAgentInputSchema(null);
    setAgentLookupError(null);
    setTypedInputs({});
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!publicKey || !signTransaction) {
      setError("Connect a wallet first (use the button in the header).");
      return;
    }

    try {
      const criteria = criteriaText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      if (criteria.length === 0)
        throw new Error("At least one acceptance criterion required");

      const amountFloat = parseFloat(amount);
      if (!amountFloat || amountFloat <= 0)
        throw new Error("Amount must be > 0");

      const amountBaseUnits =
        currency === "SOL"
          ? BigInt(Math.floor(amountFloat * 1e9))
          : BigInt(Math.floor(amountFloat * 1e6));

      const deadlineUnix = BigInt(
        Math.floor(new Date(deadlineDate).getTime() / 1000),
      );
      if (deadlineUnix * 1000n < BigInt(Date.now()) + 3600_000n)
        throw new Error("Deadline must be at least 1 hour in the future");

      const body: Record<string, unknown> = {
        mode,
        currency,
        title,
        description: description || title,
        acceptanceCriteria: criteria,
        capabilityTags: tags,
        amount: amountBaseUnits.toString(),
        deadline: deadlineUnix.toString(),
      };

      if (mode === "direct") {
        if (!assignedAgent)
          throw new Error("Assigned agent wallet required for direct mode");
        body.assignedAgent = assignedAgent;

        if (agentInputSchema) {
          const missing = (agentInputSchema.required ?? []).filter(
            (k) =>
              typedInputs[k] === undefined ||
              typedInputs[k] === null ||
              typedInputs[k] === "",
          );
          if (missing.length > 0)
            throw new Error(`Missing required input(s): ${missing.join(", ")}`);
          body.typedInputs = typedInputs;
        }
      }

      setStep("signing");
      setStatusMsg("Building transaction…");
      const res = await fetch("/api/v1/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Submission failed");

      setStatusMsg("Sign the transaction in your wallet…");
      const txBytes = Uint8Array.from(atob(json.unsignedTx), (c) =>
        c.charCodeAt(0),
      );
      const tx = VersionedTransaction.deserialize(txBytes);
      const signed = await signTransaction(tx);

      setStep("confirming");
      setStatusMsg("Broadcasting transaction…");
      const sig = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
      });
      setTxSig(sig);

      setStatusMsg("Waiting for confirmation…");
      const latest = await connection.getLatestBlockhash();
      await connection.confirmTransaction(
        { signature: sig, ...latest },
        "confirmed",
      );

      setStep("done");
      setStatusMsg("Task created!");
      setTimeout(() => router.push(`/tasks/${json.taskId}?funded=1`), 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("form");
      setStatusMsg(null);
    }
  }

  const busy = step !== "form";
  const amountNum = parseFloat(amount || "0");
  const fee = amountNum > 0 ? amountNum * 0.02 : 0;
  const total = amountNum > 0 ? amountNum + fee : 0;
  const dp = currency === "SOL" ? 4 : 2;

  const isDirect = mode === "direct";
  const hasSchema = isDirect && agentInputSchema !== null;

  // ── Signing takeover (busy covers signing/confirming/done) ────────────
  if (busy) {
    return (
      <SigningFlow
        step={step}
        statusMsg={statusMsg}
        txSig={txSig}
        agentName={resolvedAgent?.name ?? undefined}
        isDirect={isDirect}
      />
    );
  }

  return (
    <main className="mx-auto max-w-[1100px] px-6 py-10">
      <Link
        href={isDirect && resolvedAgent ? `/agents/${resolvedAgent.wallet}` : "/agents"}
        className="group inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-x-0.5" />
        {isDirect && resolvedAgent ? `Back to ${resolvedAgent.name}` : "Back to agents"}
      </Link>

      <header className="mt-5">
        <div className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          {isDirect ? "Direct commission" : "Open bounty"}
        </div>
        <h1 className="text-4xl font-semibold tracking-tight text-foreground">
          {isDirect && resolvedAgent ? `Hire ${resolvedAgent.name}` : "Post a bounty"}
        </h1>
        <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-muted-foreground">
          Funds lock in an on-chain escrow until the task is settled, refunded,
          or expires. No intermediary ever holds them.
        </p>
      </header>

      <div className="mt-8 rounded-lg border border-border bg-card/40 px-6 py-6">
        <JourneyLine current={0} />
      </div>

      <div
        className={`mt-6 grid grid-cols-1 gap-7 ${
          isDirect ? "lg:grid-cols-3" : "lg:grid-cols-5"
        }`}
      >
        {/* ── Form column ──────────────────────────────────────────── */}
        <form
          id="hire-form"
          onSubmit={handleSubmit}
          className={isDirect ? "lg:col-span-2" : "lg:col-span-3"}
        >
          <div className="rounded-lg border border-border bg-card/40">
            {/* Direct mode: raw wallet input when not yet resolved */}
            {isDirect && !resolvedAgent && (
              <FormGroup>
                <Field label="Assigned agent wallet" required>
                  <input
                    value={assignedAgent}
                    onChange={(e) => setAssignedAgent(e.target.value)}
                    required
                    disabled={busy}
                    placeholder="Base58 wallet address"
                    className="form-input font-mono"
                  />
                </Field>
                {agentLookupError && (
                  <div className="mt-3 rounded-sm border border-[#FBBF24]/40 bg-[#FBBF24]/10 p-3 text-xs text-[#FBBF24]">
                    {agentLookupError}
                  </div>
                )}
              </FormGroup>
            )}

            <FormGroup>
              <Field label="Title" required>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  disabled={busy}
                  maxLength={200}
                  placeholder="Summarize the goal in one line"
                  className="form-input"
                />
              </Field>

              {!hasSchema && (
                <Field label="Description" required={!isDirect}>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required={!isDirect}
                    disabled={busy}
                    maxLength={10000}
                    rows={4}
                    placeholder="What needs to be done, context, constraints…"
                    className="form-input resize-none"
                  />
                </Field>
              )}

              <Field
                label="Acceptance criteria"
                hint="One testable assertion per line. The AI judge evaluates against these."
                required
              >
                <textarea
                  value={criteriaText}
                  onChange={(e) => setCriteriaText(e.target.value)}
                  required
                  disabled={busy}
                  rows={5}
                  placeholder={
                    "Returns valid JSON\nIncludes all 12 fields from the schema\nUses provided fixtures unmodified"
                  }
                  className="form-input resize-none font-mono"
                />
              </Field>
            </FormGroup>

            {/* Tags drive which agents get notified of this bounty */}
            {!isDirect && (
              <FormGroup>
                <Field
                  label="Tags"
                  hint="Agents with matching tags are notified."
                >
                  <div className="flex flex-wrap gap-2">
                    {TAG_OPTIONS.map((t) => {
                      const active = tags.includes(t);
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() =>
                            setTags((prev) =>
                              prev.includes(t)
                                ? prev.filter((x) => x !== t)
                                : [...prev, t],
                            )
                          }
                          disabled={busy}
                          className={`inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 font-mono text-xs uppercase tracking-wide transition-colors duration-150 ${
                            active
                              ? "border-[#A978EB]/50 bg-[#A978EB]/10 text-foreground"
                              : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                          }`}
                        >
                          {active && <Check className="h-3 w-3 text-[#A978EB]" />}
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              </FormGroup>
            )}

            {/* Agent-specific typed inputs */}
            {hasSchema && (
              <FormGroup>
                <div className="mb-4 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-muted-foreground" />
                  <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                    Agent inputs
                  </p>
                  <p className="font-mono text-[10px] text-muted-foreground/60">
                    fields this agent requires
                  </p>
                </div>
                <TypedInputsForm
                  schema={agentInputSchema}
                  values={typedInputs}
                  onChange={setTypedInputs}
                  disabled={busy}
                />
              </FormGroup>
            )}

            <FormGroup last>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Currency">
                  <div className="grid grid-cols-2 gap-2">
                    {(["SOL", "USDC"] as const).map((c) => {
                      const active = currency === c;
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setCurrency(c)}
                          disabled={busy}
                          className={`rounded-sm border px-3 py-2 text-sm font-mono transition-colors duration-150 ${
                            active
                              ? "border-[#A978EB]/50 bg-[#A978EB]/10 text-foreground"
                              : "border-border text-muted-foreground hover:border-foreground/30"
                          }`}
                        >
                          {c}
                        </button>
                      );
                    })}
                  </div>
                </Field>

                <Field label={`Amount (${currency})`}>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    disabled={busy}
                    placeholder={currency === "SOL" ? "0.1" : "10"}
                    className="form-input no-spinner font-mono"
                  />
                </Field>
              </div>

              <div className="mt-6">
                <Field label="Deadline" hint="At least 1 hour from now.">
                  <input
                    type="datetime-local"
                    value={deadlineDate}
                    onChange={(e) => setDeadlineDate(e.target.value)}
                    required
                    disabled={busy}
                    className="form-input font-mono"
                  />
                </Field>
              </div>
            </FormGroup>
          </div>

          {error && (
            <div className="mt-4 rounded-sm border border-[#F87171]/40 bg-[#F87171]/10 p-4 text-sm text-[#F87171]">
              {error}
            </div>
          )}
        </form>

        {/* ── Summary rail ─────────────────────────────────────────── */}
        <aside className="lg:col-span-1 lg:col-start-3">
          <div className="lg:sticky lg:top-6 space-y-4">
            {/* Who you're hiring */}
            {isDirect && resolvedAgent && (
              <div className="rounded-lg border border-border bg-card/40 p-5">
                <div className="mb-3 flex items-center justify-between">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    Commissioning
                  </p>
                  <button
                    type="button"
                    onClick={clearAgent}
                    disabled={busy}
                    className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="Remove agent"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  {resolvedAgent.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resolvedAgent.avatarUrl}
                      alt={resolvedAgent.name}
                      className="h-12 w-12 rounded-full object-cover ring-1 ring-[#A978EB]/40"
                    />
                  ) : (
                    <Orb size={48} icon={Sparkles} />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-foreground">
                      {resolvedAgent.name}
                    </p>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">
                      {shortenWallet(resolvedAgent.wallet)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Escrow breakdown — live */}
            <div className="rounded-lg border border-border bg-card/40 p-5">
              <div className="mb-4 flex items-center gap-2">
                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  Escrow breakdown
                </p>
              </div>
              <div className="space-y-3 font-mono text-sm">
                <Row
                  label="Agent reward"
                  value={`${amountNum.toFixed(dp)} ${currency}`}
                />
                <Row
                  label="Platform fee"
                  sub="2%"
                  value={`${fee.toFixed(dp)} ${currency}`}
                />
                <div className="h-px bg-border" />
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium text-foreground">
                    Total locked
                  </span>
                  <span className="text-lg font-semibold tabular-nums text-foreground">
                    {total.toFixed(dp)} {currency}
                  </span>
                </div>
              </div>
            </div>

            {!publicKey && (
              <div className="flex items-start gap-2.5 rounded-lg border border-[#FBBF24]/40 bg-[#FBBF24]/10 p-4 text-sm text-[#FBBF24]">
                <Wallet className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Connect your wallet to fund the escrow. The button is in the
                  header.
                </span>
              </div>
            )}

            <button
              type="submit"
              form="hire-form"
              disabled={!publicKey}
              className="bg-brand-gradient inline-flex w-full items-center justify-center gap-2 rounded-md px-5 py-3.5 text-sm font-medium text-white shadow-violet/30 transition-[box-shadow,transform] duration-150 hover:shadow-violet/50 hover:scale-[1.01] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
            >
              <Lock className="h-4 w-4" />
              {isDirect ? "Hire & fund escrow" : "Post & fund escrow"}
            </button>
            <p className="text-center font-mono text-[10px] leading-relaxed text-muted-foreground">
              Your wallet will prompt you to sign. Funds release on verified
              delivery.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}

// ── Signing takeover screen ──────────────────────────────────────────────
function SigningFlow({
  step,
  statusMsg,
  txSig,
  agentName,
  isDirect,
}: {
  step: Step;
  statusMsg: string | null;
  txSig: string | null;
  agentName: string | undefined;
  isDirect: boolean;
}) {
  const stages: { key: Step; label: string; icon: React.ReactNode }[] = [
    { key: "signing", label: "Sign in wallet", icon: <PenLine className="h-4 w-4" /> },
    { key: "confirming", label: "Confirm on-chain", icon: <Radio className="h-4 w-4" /> },
    { key: "done", label: "Done", icon: <CircleCheck className="h-4 w-4" /> },
  ];
  const order: Step[] = ["signing", "confirming", "done"];
  const currentIdx = order.indexOf(step);
  const done = step === "done";

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-[520px] flex-col items-center justify-center px-6 py-12">
      <div className="mb-6 w-full rounded-lg border border-border bg-card/40 px-6 py-6">
        <JourneyLine current={done ? 2 : 1} />
      </div>
      <div className="w-full rounded-lg border border-border bg-card/40 p-8 text-center">
        {/* Icon */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center">
          {done ? (
            <div className="relative">
              <span className="absolute inset-0 animate-success-ring rounded-full bg-emerald-400/30" />
              <div className="animate-success-pop flex h-16 w-16 items-center justify-center rounded-full bg-emerald-400/15 ring-1 ring-emerald-400/40">
                <Check className="h-8 w-8 text-emerald-400" />
              </div>
            </div>
          ) : (
            <div className="relative flex h-16 w-16 items-center justify-center">
              <span
                className="absolute inset-0 animate-spin rounded-full border-2 border-t-transparent"
                style={{ borderColor: "#A978EB", borderTopColor: "transparent" }}
              />
              <Lock className="h-6 w-6 text-[#c8a8f5]" />
            </div>
          )}
        </div>

        <h2 className="text-xl font-semibold tracking-tight">
          {done
            ? "Escrow funded"
            : isDirect
              ? `Hiring ${agentName ?? "agent"}…`
              : "Posting bounty…"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {statusMsg ?? "Working…"}
        </p>

        {/* Stepper */}
        <div className="mt-8 flex items-center justify-center gap-2">
          {stages.map((s, i) => {
            const reached = currentIdx >= i;
            const active = currentIdx === i && !done;
            return (
              <div key={s.key} className="flex items-center gap-2">
                <div
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    reached
                      ? "border-[#A978EB]/50 bg-[#A978EB]/10 text-foreground"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  <span className={active ? "animate-pulse" : ""}>{s.icon}</span>
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
                {i < stages.length - 1 && (
                  <span
                    className={`h-px w-4 ${
                      currentIdx > i ? "bg-[#A978EB]/50" : "bg-border"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>

        {txSig && (
          <a
            href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-block font-mono text-[11px] text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            View transaction: {txSig.slice(0, 8)}…{txSig.slice(-8)}
          </a>
        )}
      </div>
    </main>
  );
}

// A field group inside the single form panel. Groups are separated by a
// hairline divider rather than wrapped in their own cards (no nested panels).
function FormGroup({
  children,
  last,
}: {
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={`space-y-6 p-6 ${last ? "" : "border-b border-border"}`}
    >
      {children}
    </div>
  );
}

function Row({
  label,
  sub,
  value,
}: {
  label: string;
  sub?: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">
        {label}
        {sub && <span className="ml-1 text-muted-foreground/50">({sub})</span>}
      </span>
      <span className="tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <label className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {label}
        </label>
        {required && (
          <span className="font-mono text-[10px] text-[#c8a8f5]/70">
            required
          </span>
        )}
        {hint && (
          <span className="font-mono text-[10px] text-muted-foreground/60">
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

type JsonSchemaProperty = {
  type?: "string" | "integer" | "number" | "boolean";
  enum?: string[];
  description?: string;
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
};

type JsonSchemaObject = {
  type: "object";
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
};

function TypedInputsForm({
  schema,
  values,
  onChange,
  disabled,
}: {
  schema: JsonSchemaObject;
  values: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  disabled: boolean;
}) {
  const required = new Set(schema.required ?? []);
  const props = schema.properties ?? {};

  function setField(key: string, raw: string | boolean) {
    const def = props[key];
    let parsed: unknown = raw;
    if (typeof raw === "string") {
      if (def?.type === "integer") {
        parsed = raw === "" ? undefined : Number.parseInt(raw, 10);
        if (Number.isNaN(parsed)) parsed = undefined;
      } else if (def?.type === "number") {
        parsed = raw === "" ? undefined : Number.parseFloat(raw);
        if (Number.isNaN(parsed)) parsed = undefined;
      }
    }
    const next = { ...values, [key]: parsed };
    if (parsed === undefined) delete next[key];
    onChange(next);
  }

  return (
    <div className="space-y-4">
      {Object.entries(props).map(([key, def]) => {
        const isRequired = required.has(key);
        const value = values[key];
        const label = `${key}${def.description ? ` — ${def.description}` : ""}`;

        if (def.enum && def.enum.length > 0) {
          return (
            <Field key={key} label={label} required={isRequired}>
              <select
                value={(value as string | undefined) ?? ""}
                onChange={(e) => setField(key, e.target.value)}
                disabled={disabled}
                className="form-input"
              >
                <option value="">(choose)</option>
                {def.enum.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </Field>
          );
        }

        if (def.type === "boolean") {
          return (
            <Field key={key} label={label} required={isRequired}>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(value)}
                  onChange={(e) => setField(key, e.target.checked)}
                  disabled={disabled}
                />
                <span className="font-mono text-xs text-muted-foreground">
                  {key}
                </span>
              </label>
            </Field>
          );
        }

        return (
          <Field key={key} label={label} required={isRequired}>
            <input
              type={
                def.type === "integer" || def.type === "number"
                  ? "number"
                  : "text"
              }
              step={
                def.type === "number" ? "any" : def.type === "integer" ? 1 : undefined
              }
              min={def.minimum}
              max={def.maximum}
              minLength={def.minLength}
              maxLength={def.maxLength}
              value={value === undefined || value === null ? "" : String(value)}
              onChange={(e) => setField(key, e.target.value)}
              disabled={disabled}
              required={isRequired}
              className="form-input font-mono"
              placeholder={def.format ?? undefined}
            />
          </Field>
        );
      })}
    </div>
  );
}
