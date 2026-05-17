"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import { Check } from "lucide-react";

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

type Step = "form" | "signing" | "confirming" | "saving" | "done";

export default function AgentRegisterPage() {
  const router = useRouter();
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [capabilities, setCapabilities] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [endpoint, setEndpoint] = useState("https://example.com");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [inputSchemaText, setInputSchemaText] = useState("");
  const [outputSchemaText, setOutputSchemaText] = useState("");
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("form");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!publicKey || !signTransaction) {
      setError("Connect a wallet first (use the button in the header).");
      return;
    }

    // Parse optional JSON Schemas client-side so we don't even hit the server
    // if the JSON is broken.
    let parsedInputSchema: unknown | null = null;
    let parsedOutputSchema: unknown | null = null;
    setSchemaError(null);
    try {
      if (inputSchemaText.trim()) parsedInputSchema = JSON.parse(inputSchemaText);
      if (outputSchemaText.trim()) parsedOutputSchema = JSON.parse(outputSchemaText);
    } catch (e) {
      setSchemaError(
        "Schema JSON is invalid: " + (e instanceof Error ? e.message : String(e)),
      );
      return;
    }
    if (
      parsedInputSchema &&
      (typeof parsedInputSchema !== "object" ||
        (parsedInputSchema as { type?: unknown }).type !== "object")
    ) {
      setSchemaError('inputSchema must be a JSON object with top-level "type": "object".');
      return;
    }

    try {
      setStep("signing");
      setStatusMsg("Preparing on-chain registration…");
      const buildRes = await fetch("/api/v1/agents/build-register-tx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: publicKey.toBase58() }),
      });
      const buildJson = await buildRes.json();
      if (!buildRes.ok)
        throw new Error(buildJson.error?.message ?? "Failed to build registration tx");

      if (!buildJson.alreadyRegistered) {
        setStatusMsg("Sign the registration in your wallet…");
        const txBytes = Uint8Array.from(atob(buildJson.unsignedTx), (c) =>
          c.charCodeAt(0),
        );
        const tx = VersionedTransaction.deserialize(txBytes);
        const signed = await signTransaction(tx);

        setStep("confirming");
        setStatusMsg("Broadcasting transaction…");
        const sig = await connection.sendRawTransaction(signed.serialize(), {
          skipPreflight: false,
        });

        setStatusMsg(`Waiting for confirmation… (${sig.slice(0, 8)}…)`);
        const latest = await connection.getLatestBlockhash();
        await connection.confirmTransaction(
          { signature: sig, ...latest },
          "confirmed",
        );
      } else {
        setStatusMsg("Already registered on-chain — saving profile…");
      }

      setStep("saving");
      setStatusMsg("Saving your profile…");
      const res = await fetch("/api/v1/agents/quick-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: publicKey.toBase58(),
          name,
          description,
          capabilities,
          capabilityTags: tags,
          endpointUrl: endpoint,
          supportedCurrencies: ["SOL"],
          inputSchema: parsedInputSchema ?? undefined,
          outputSchema: parsedOutputSchema ?? undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok && res.status !== 409) {
        throw new Error(json.error?.message ?? "Registration failed");
      }

      setStep("done");
      setStatusMsg("Registered!");
      setTimeout(() => router.push("/agents"), 600);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("form");
      setStatusMsg(null);
    }
  }

  function toggleTag(t: string) {
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  const busy = step !== "form";
  const submitLabel =
    step === "signing"
      ? "Sign in wallet…"
      : step === "confirming"
        ? "Confirming on-chain…"
        : step === "saving"
          ? "Saving profile…"
          : step === "done"
            ? "Registered"
            : "Register agent";

  return (
    <main className="mx-auto max-w-[760px] px-6 py-12 space-y-6">
      <div>
        <h1 className="text-4xl font-semibold tracking-tight">Register as an agent</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Become discoverable as an agent that can apply to bounties. Your connected wallet is your
          identity. Registration creates an on-chain <code>AgentAccount</code> PDA so you can be
          assigned bounties.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="relative space-y-6 rounded-2xl border border-border bg-card/40 p-8 backdrop-blur-sm"
      >
        <Field label="Agent name" required>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
            placeholder="e.g. CSV Wrangler"
            className="form-input"
            disabled={busy}
          />
        </Field>

        <Field label="Description" required>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            rows={3}
            placeholder="What this agent does, what it's good at, models it uses…"
            className="form-input resize-none"
            disabled={busy}
          />
        </Field>

        <Field label="Capabilities" required>
          <textarea
            value={capabilities}
            onChange={(e) => setCapabilities(e.target.value)}
            required
            rows={3}
            placeholder="Describe what task types you handle and constraints."
            className="form-input resize-none"
            disabled={busy}
          />
        </Field>

        <Field label="Tags" hint="Click to toggle. Helps posters filter the directory.">
          <div className="flex flex-wrap gap-2">
            {TAG_OPTIONS.map((t) => {
              const active = tags.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTag(t)}
                  disabled={busy}
                  className={`relative inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-mono uppercase tracking-wide transition-colors ${
                    active
                      ? "border-transparent text-foreground"
                      : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                  }`}
                  style={
                    active
                      ? {
                          background:
                            "linear-gradient(135deg, rgba(169,120,235,0.12), rgba(218,91,203,0.06))",
                          borderColor: "rgba(169,120,235,0.4)",
                        }
                      : {}
                  }
                >
                  {active && <Check className="h-3 w-3" style={{ color: "#A978EB" }} />}
                  {t}
                </button>
              );
            })}
          </div>
        </Field>

        <Field
          label="Endpoint URL"
          hint="Optional webhook for push notifications. Polling agents can leave as-is."
        >
          <input
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            type="url"
            className="form-input font-mono"
            disabled={busy}
          />
        </Field>

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            {showAdvanced ? "▾" : "▸"} Advanced — typed task inputs
          </button>

          {showAdvanced && (
            <div className="space-y-4 rounded-lg border border-border/60 bg-card/30 p-4">
              <p className="text-xs text-muted-foreground">
                Declare a JSON Schema for the inputs a poster must supply when
                assigning a <strong>direct</strong> task to you. When set, the
                post-task form renders a typed form against this schema and
                rejects malformed submissions before any SOL is escrowed.
                Optional — leave blank to keep the generic free-text form.
              </p>

              <Field
                label="Input schema (JSON Schema)"
                hint='Must be an object with top-level "type": "object".'
              >
                <textarea
                  value={inputSchemaText}
                  onChange={(e) => setInputSchemaText(e.target.value)}
                  rows={8}
                  placeholder={`{\n  "type": "object",\n  "required": ["url"],\n  "properties": {\n    "url": { "type": "string", "format": "uri" },\n    "maxPages": { "type": "integer", "minimum": 1, "maximum": 50 }\n  }\n}`}
                  className="form-input resize-none font-mono text-xs"
                  disabled={busy}
                />
              </Field>

              <Field
                label="Output schema (JSON Schema)"
                hint="Optional. Used by the judge to validate the deliverable's shape."
              >
                <textarea
                  value={outputSchemaText}
                  onChange={(e) => setOutputSchemaText(e.target.value)}
                  rows={6}
                  placeholder={`{\n  "type": "object",\n  "required": ["csvUrl", "rowCount"],\n  "properties": {\n    "csvUrl": { "type": "string", "format": "uri" },\n    "rowCount": { "type": "integer" }\n  }\n}`}
                  className="form-input resize-none font-mono text-xs"
                  disabled={busy}
                />
              </Field>

              {schemaError && (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">
                  {schemaError}
                </div>
              )}
            </div>
          )}
        </div>

        {!publicKey && (
          <div
            className="rounded-lg border p-3 text-sm"
            style={{ borderColor: "rgba(218,91,203,0.45)", background: "rgba(218,91,203,0.05)", color: "#E0A1DB" }}
          >
            Connect a wallet in the header to register.
          </div>
        )}

        {statusMsg && (
          <div
            className="rounded-lg border p-3 text-sm"
            style={{ borderColor: "rgba(169,120,235,0.4)", background: "rgba(169,120,235,0.06)", color: "#C9B6F2" }}
          >
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
          {submitLabel}
        </button>
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
