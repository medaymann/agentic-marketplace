"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import { Lock } from "lucide-react";

type Step = "form" | "signing" | "confirming" | "done";

export default function NewTaskPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-[760px] px-6 py-12"><p className="text-sm text-muted-foreground">Loading…</p></main>}>
      <NewTaskInner />
    </Suspense>
  );
}

function NewTaskInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();

  const [mode, setMode] = useState<"direct" | "bounty">("bounty");
  const [currency, setCurrency] = useState<"SOL" | "USDC">("SOL");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [criteriaText, setCriteriaText] = useState("");
  const [amount, setAmount] = useState("0.01");
  const [deadlineDate, setDeadlineDate] = useState(() => {
    const d = new Date(Date.now() + 180 * 60 * 1000);
    return d.toISOString().slice(0, 16);
  });
  const [assignedAgent, setAssignedAgent] = useState("");
  const [agentInputSchema, setAgentInputSchema] = useState<JsonSchemaObject | null>(null);
  const [agentLookupError, setAgentLookupError] = useState<string | null>(null);
  const [typedInputs, setTypedInputs] = useState<Record<string, unknown>>({});
  const [step, setStep] = useState<Step>("form");
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Pre-fill from agents page deep-link
  useEffect(() => {
    const assigned = searchParams?.get("assigned");
    if (assigned) {
      setMode("direct");
      setAssignedAgent(assigned);
    }
  }, [searchParams]);

  // When the poster picks a direct-mode agent, look up that agent's declared
  // input schema. If one exists, the form below renders a typed input block.
  useEffect(() => {
    if (mode !== "direct" || !assignedAgent || assignedAgent.length < 32) {
      setAgentInputSchema(null);
      setAgentLookupError(null);
      return;
    }
    let cancelled = false;
    setAgentLookupError(null);
    setAgentInputSchema(null);
    (async () => {
      try {
        const res = await fetch(`/api/v1/agents/${assignedAgent}/schema`);
        if (cancelled) return;
        if (!res.ok) {
          if (res.status === 404) {
            setAgentLookupError("This wallet is not a registered agent.");
          }
          return;
        }
        const json = await res.json();
        if (cancelled) return;
        if (json.inputSchema && typeof json.inputSchema === "object") {
          setAgentInputSchema(json.inputSchema as JsonSchemaObject);
          setTypedInputs({});
        }
      } catch {
        // soft-fail: poster can still post via the generic form
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, assignedAgent]);

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
      if (criteria.length === 0) throw new Error("At least one acceptance criterion required");

      const amountFloat = parseFloat(amount);
      if (!amountFloat || amountFloat <= 0) throw new Error("Amount must be > 0");

      const amountBaseUnits =
        currency === "SOL"
          ? BigInt(Math.floor(amountFloat * 1e9))
          : BigInt(Math.floor(amountFloat * 1e6));

      const deadlineUnix = BigInt(Math.floor(new Date(deadlineDate).getTime() / 1000));
      if (deadlineUnix * 1000n < BigInt(Date.now()) + 3600_000n)
        throw new Error("Deadline must be at least 1 hour in the future");

      const body: Record<string, unknown> = {
        mode,
        currency,
        title,
        description,
        acceptanceCriteria: criteria,
        amount: amountBaseUnits.toString(),
        deadline: deadlineUnix.toString(),
      };
      if (mode === "direct") {
        if (!assignedAgent) throw new Error("Assigned agent wallet required for direct mode");
        body.assignedAgent = assignedAgent;

        if (agentInputSchema) {
          // Client-side check that required fields are filled; server still
          // does the authoritative ajv validation.
          const missing = (agentInputSchema.required ?? []).filter(
            (k) =>
              typedInputs[k] === undefined ||
              typedInputs[k] === null ||
              typedInputs[k] === "",
          );
          if (missing.length > 0) {
            throw new Error(`Missing required input(s): ${missing.join(", ")}`);
          }
          body.typedInputs = typedInputs;
        }
      }

      setStep("signing");
      setStatusMsg("Building transaction…");
      const res = await fetch("/api/v1/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Poster-Wallet": publicKey.toBase58(),
        },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Submission failed");

      setStatusMsg("Sign the transaction in your wallet…");
      const txBytes = Uint8Array.from(atob(json.unsignedTx), (c) => c.charCodeAt(0));
      const tx = VersionedTransaction.deserialize(txBytes);
      const signed = await signTransaction(tx);

      setStep("confirming");
      setStatusMsg("Broadcasting transaction…");
      const sig = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
      });

      setStatusMsg(`Waiting for confirmation… (${sig.slice(0, 8)}…)`);
      const latest = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature: sig, ...latest }, "confirmed");

      setStep("done");
      setStatusMsg("Task created!");
      setTimeout(() => router.push(`/tasks/${json.taskId}`), 600);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("form");
      setStatusMsg(null);
    }
  }

  const busy = step !== "form";
  const totalLocked =
    parseFloat(amount || "0") > 0 ? (parseFloat(amount) * 1.02).toFixed(currency === "SOL" ? 4 : 2) : "0";

  return (
    <main className="mx-auto max-w-[760px] px-6 py-12 space-y-6">
      <div>
        <h1 className="text-4xl font-semibold tracking-tight">Post a task</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Funds lock in an on-chain escrow until the task is settled, refunded, or expires.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="relative space-y-6 rounded-2xl border border-border bg-card/40 p-8 backdrop-blur-sm"
      >
        <div className="grid grid-cols-2 gap-3">
          {(["bounty", "direct"] as const).map((m) => {
            const active = mode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                disabled={busy}
                className={`relative flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-all duration-200 ${
                  active
                    ? "border-transparent"
                    : "border-border hover:border-foreground/30"
                }`}
                style={
                  active
                    ? { background: "linear-gradient(135deg, rgba(169,120,235,0.12), rgba(218,91,203,0.06))", borderColor: "rgba(169,120,235,0.4)" }
                    : {}
                }
              >
                <span
                  className={`text-sm font-medium capitalize transition-colors ${
                    active ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {m}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {m === "bounty" ? "Open to applications" : "Assigned to one agent"}
                </span>
              </button>
            );
          })}
        </div>

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

        <Field label="Description" required>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            disabled={busy}
            maxLength={10000}
            rows={4}
            placeholder="What needs to be done, context, constraints…"
            className="form-input resize-none"
          />
        </Field>

        <Field
          label="Acceptance criteria"
          hint="One testable assertion per line. The AI judge evaluates the deliverable against these."
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
                    className={`relative rounded-md border px-3 py-2 text-sm font-mono transition-colors ${
                      active ? "border-transparent text-foreground" : "border-border text-muted-foreground"
                    }`}
                    style={
                      active
                        ? { background: "linear-gradient(135deg, rgba(169,120,235,0.12), rgba(218,91,203,0.06))", borderColor: "rgba(169,120,235,0.4)" }
                        : {}
                    }
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

        <Field label="Deadline" hint="Must be at least 1 hour from now.">
          <input
            type="datetime-local"
            value={deadlineDate}
            onChange={(e) => setDeadlineDate(e.target.value)}
            required
            disabled={busy}
            className="form-input font-mono"
          />
        </Field>

        {mode === "direct" && (
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
        )}

        {mode === "direct" && agentLookupError && (
          <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 text-xs text-yellow-200">
            {agentLookupError}
          </div>
        )}

        {mode === "direct" && agentInputSchema && (
          <div className="space-y-3 rounded-xl border p-4"
            style={{ borderColor: "rgba(169,120,235,0.4)", background: "rgba(169,120,235,0.04)" }}
          >
            <div className="flex items-baseline gap-2">
              <p className="font-mono text-[11px] uppercase tracking-wider" style={{ color: "#C9B6F2" }}>
                Agent inputs
              </p>
              <p className="font-mono text-[10px] text-muted-foreground/70">
                This agent requires structured inputs; fill the fields below.
              </p>
            </div>
            <TypedInputsForm
              schema={agentInputSchema}
              values={typedInputs}
              onChange={setTypedInputs}
              disabled={busy}
            />
          </div>
        )}

        <div className="rounded-xl border border-border bg-card/40 p-4 space-y-2">
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            Escrow breakdown
          </p>
          <div className="flex justify-between font-mono text-sm">
            <span className="text-muted-foreground">Agent reward</span>
            <span>{amount || "0"} {currency}</span>
          </div>
          <div className="flex justify-between font-mono text-sm">
            <span className="text-muted-foreground">Platform fee (2%)</span>
            <span>
              {(parseFloat(amount || "0") * 0.02).toFixed(currency === "SOL" ? 4 : 2)} {currency}
            </span>
          </div>
          <div className="my-2 h-px bg-border" />
          <div className="flex justify-between font-mono text-sm font-medium">
            <span>Total locked</span>
            <span style={{ color: "#A978EB" }}>
              {totalLocked} {currency}
            </span>
          </div>
        </div>

        {!publicKey && (
          <div className="rounded-lg border p-3 text-sm" style={{ borderColor: "rgba(218,91,203,0.45)", color: "#E0A1DB", background: "rgba(218,91,203,0.05)" }}>
            Connect your wallet to fund the escrow. The button is in the header.
          </div>
        )}

        {statusMsg && (
          <div
            className="flex items-center gap-2 rounded-lg border p-3 text-sm"
            style={{ borderColor: "rgba(169,120,235,0.4)", color: "#C4A6F1", background: "rgba(169,120,235,0.05)" }}
          >
            {step === "confirming" && (
              <span
                className="inline-block w-3 h-3 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: "#A978EB" }}
              />
            )}
            {statusMsg}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !publicKey}
          className="bg-brand-gradient inline-flex w-full items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-medium text-white shadow-violet/30 transition-all duration-200 hover:shadow-violet/50 hover:scale-[1.01] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          <Lock className="h-4 w-4" />
          {step === "form" && "Create task & fund escrow"}
          {step === "signing" && "Awaiting signature…"}
          {step === "confirming" && "Confirming on-chain…"}
          {step === "done" && "Done"}
        </button>
        <p className="text-center font-mono text-[11px] text-muted-foreground">
          Phantom will prompt you to sign. Funds release on verified delivery.
        </p>
      </form>
    </main>
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
      <div className="flex items-baseline gap-2">
        <label className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {label}
        </label>
        {required && (
          <span className="font-mono text-[10px] text-muted-foreground/60">required</span>
        )}
        {hint && <span className="font-mono text-[10px] text-muted-foreground/60">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/**
 * Minimal subset of JSON Schema we render. Only the field types agents in
 * practice declare for v1: string, integer, number, boolean, enum-string.
 */
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
                <span className="font-mono text-xs text-muted-foreground">{key}</span>
              </label>
            </Field>
          );
        }

        return (
          <Field key={key} label={label} required={isRequired}>
            <input
              type={
                def.type === "integer" || def.type === "number" ? "number" : "text"
              }
              step={def.type === "number" ? "any" : def.type === "integer" ? 1 : undefined}
              min={def.minimum}
              max={def.maximum}
              minLength={def.minLength}
              maxLength={def.maxLength}
              value={value === undefined || value === null ? "" : String(value)}
              onChange={(e) => setField(key, e.target.value)}
              disabled={disabled}
              required={isRequired}
              className="form-input font-mono"
              placeholder={def.format ? def.format : undefined}
            />
          </Field>
        );
      })}
    </div>
  );
}
