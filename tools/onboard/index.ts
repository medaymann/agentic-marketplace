#!/usr/bin/env tsx
/**
 * basira-onboard
 *
 * Registers an agent: collects metadata in the terminal, opens the Basira
 * onboarding page so the wallet signs once, then receives the issued API key on
 * a one-shot localhost listener and writes it to a .env the SDK auto-loads.
 *
 * No private key ever touches this script — the wallet signs in the browser.
 *
 * UI: one cohesive violet flow built on @clack/core prompt engines with our own
 * render functions (clack handles input reliably; we own every pixel of color),
 * so the whole experience reads as a single brand-violet form on a left rail.
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { platform } from "node:os";
import { stdin, stdout } from "node:process";
import { existsSync, writeFileSync, readFileSync, statSync } from "node:fs";
import { resolve, basename, extname } from "node:path";
import {
  TextPrompt,
  SelectPrompt,
  MultiSelectPrompt,
  isCancel,
} from "@clack/core";

const BASIRA_URL = process.env["BASIRA_URL"] ?? "http://localhost:3000";

// ─── Theme ──────────────────────────────────────────────────────────────────

const useColor = stdout.isTTY && !process.env["NO_COLOR"];
const paint = (code: string) => (s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const c = {
  bold: paint("1"),
  dim: paint("2"),
  violet: paint("38;5;141"),
  violetDim: paint("38;5;97"),
  white: paint("97"),
  red: paint("31"),
};

// Rail + step glyphs. The vertical bar runs down the left of every step so the
// flow reads as one connected form.
const S = {
  top: "◆",
  bar: "│",
  active: "◆",
  step: "◇",
  end: "└",
  radioOn: "●",
  radioOff: "○",
  checkOn: "◼",
  checkOff: "◻",
  pointer: "▸",
};

const bar = () => c.violetDim(S.bar);

// Block-letter wordmark shown at the top of onboarding. Outlined/hollow box
// style (ANSI-Shadow-like) to match a bold terminal banner.
const BANNER = String.raw`
██████╗  █████╗ ███████╗██╗██████╗  █████╗
██╔══██╗██╔══██╗██╔════╝██║██╔══██╗██╔══██╗
██████╔╝███████║███████╗██║██████╔╝███████║
██╔══██╗██╔══██║╚════██║██║██╔══██╗██╔══██║
██████╔╝██║  ██║███████║██║██║  ██║██║  ██║
╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝╚═╝  ╚═╝╚═╝  ╚═╝`;

/** Solid violet background "chip" for titles (like a highlighted rectangle). */
const chip = (s: string) =>
  useColor ? `\x1b[48;5;99m\x1b[97m\x1b[1m ${s} \x1b[0m` : `[ ${s} ]`;

/** Opening banner: ASCII art, tagline under it, then the chip line where the
 * rail begins. Indented to align with the prompt label text (column 3). */
function intro(subtitle: string) {
  const pad = "   "; // align with label text after "◆  "
  const rows = BANNER.replace(/^\n/, "").split("\n");

  // Vertical violet gradient (bright top → deeper bottom), truecolor.
  const top = [196, 152, 255];
  const bot = [124, 58, 237];
  const render = (line: string, i: number) => {
    if (!useColor) return pad + line;
    const t = rows.length > 1 ? i / (rows.length - 1) : 0;
    const r = Math.round(top[0]! + (bot[0]! - top[0]!) * t);
    const g = Math.round(top[1]! + (bot[1]! - top[1]!) * t);
    const b = Math.round(top[2]! + (bot[2]! - top[2]!) * t);
    return `${pad}\x1b[1m\x1b[38;2;${r};${g};${b}m${line}\x1b[0m`;
  };

  stdout.write("\n");
  stdout.write(rows.map(render).join("\n") + "\n");
  stdout.write(`${pad}${c.dim(subtitle)}\n`);
  stdout.write("\n");
  stdout.write(`${pad}${chip("Agent onboarding")}\n`);
  stdout.write(`${bar()}\n`);
}

/** A standalone note block on the rail (used for hints + the review summary). */
function note(title: string, lines: string[]) {
  stdout.write(`${c.violet(S.step)}  ${c.bold(title)}\n`);
  for (const line of lines) stdout.write(`${bar()}  ${line}\n`);
  stdout.write(`${bar()}\n`);
}

/** Closing block; success summary with the rail ending. */
function outro(lines: string[]) {
  for (const line of lines) stdout.write(`${bar()}  ${line}\n`);
  stdout.write(`${c.violet(S.end)}\n\n`);
}

// ─── Prompts (clack engine, violet render) ───────────────────────────────────

function fmtStepTitle(message: string, state: string) {
  const sym =
    state === "submit" ? c.violet(S.step)
    : state === "cancel" ? c.red(S.step)
    : c.violet(S.active);
  return `${sym}  ${c.bold(message)}`;
}

interface Option<T> { value: T; label: string }

/** Free-text prompt. `optional` adds a skip hint; empty submit returns "". */
async function text(
  message: string,
  opts: { hint?: string; optional?: boolean; validate?: (v: string) => string | undefined } = {},
): Promise<string> {
  if (!stdin.isTTY) return "";
  const prompt = new TextPrompt({
    validate: opts.validate
      ? (v) => opts.validate!((v ?? "").trim())
      : opts.optional
        ? undefined
        : (v) => ((v ?? "").trim() ? undefined : "Required."),
    render() {
      const title = fmtStepTitle(message, this.state);
      const hint = opts.hint ? `  ${c.dim(opts.hint)}` : "";
      if (this.state === "submit") {
        return `${title}\n${bar()}  ${c.dim((this.value ?? "").trim() || "—")}`;
      }
      if (this.state === "error") {
        return `${title}${hint}\n${bar()}  ${this.userInputWithCursor}\n${c.red(S.end)}  ${c.red(this.error)}`;
      }
      return `${title}${hint}\n${bar()}  ${this.userInputWithCursor}\n${c.violetDim(S.end)}`;
    },
  });
  const result = await prompt.prompt();
  if (isCancel(result)) cancel();
  return (result as string).trim();
}

/** Single-select with the radio rail in violet. */
async function select<T>(message: string, options: Option<T>[]): Promise<T> {
  if (!stdin.isTTY) return options[0]!.value;
  const prompt = new SelectPrompt<{ value: T; label: string }>({
    options,
    initialValue: options[0]!.value,
    render() {
      const title = fmtStepTitle(message, this.state);
      if (this.state === "submit" || this.state === "cancel") {
        return `${title}\n${bar()}  ${c.dim(options[this.cursor]!.label)}`;
      }
      const rows = options
        .map((o, i) => {
          const on = i === this.cursor;
          const mark = on ? c.violet(S.radioOn) : c.dim(S.radioOff);
          const label = on ? c.white(o.label) : c.dim(o.label);
          return `${bar()}  ${mark} ${label}`;
        })
        .join("\n");
      return `${title}\n${rows}\n${c.violetDim(S.end)}`;
    },
  });
  const result = await prompt.prompt();
  if (isCancel(result)) cancel();
  return result as T;
}

/** Multi-select checklist with the checkbox rail in violet. */
async function multiselect(
  message: string,
  options: Option<string>[],
  hint: string,
): Promise<string[]> {
  if (!stdin.isTTY) return [];
  const prompt = new MultiSelectPrompt<{ value: string; label: string }>({
    options,
    initialValues: [],
    required: false,
    render() {
      const selected = (this.value ?? []) as string[];
      const title = `${fmtStepTitle(message, this.state)}  ${c.dim(hint)}`;
      if (this.state === "submit" || this.state === "cancel") {
        const chosen = options.filter((o) => selected.includes(o.value)).map((o) => o.label);
        return `${title}\n${bar()}  ${c.dim(chosen.join(", ") || "none")}`;
      }
      const rows = options
        .map((o, i) => {
          const on = i === this.cursor;
          const checked = selected.includes(o.value);
          const box = checked ? c.violet(S.checkOn) : c.dim(S.checkOff);
          const pointer = on ? c.violet(S.pointer) : " ";
          const label = on ? c.white(o.label) : checked ? o.label : c.dim(o.label);
          return `${bar()}  ${pointer} ${box} ${label}`;
        })
        .join("\n");
      return `${title}\n${rows}\n${c.violetDim(S.end)}`;
    },
  });
  const result = await prompt.prompt();
  if (isCancel(result)) cancel();
  return result as string[];
}

/** Spinner on the rail; returns stop(). */
function spinner(label: string): () => void {
  if (!useColor) {
    stdout.write(`${bar()}  ${label}\n`);
    return () => {};
  }
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  const draw = () => stdout.write(`\r${bar()}  ${c.violet(frames[i++ % frames.length]!)} ${label}`);
  draw();
  const id = setInterval(draw, 80);
  return () => {
    clearInterval(id);
    stdout.write("\r\x1b[2K");
  };
}

function cancel(): never {
  stdout.write(`${c.red(S.end)}  ${c.red("Cancelled.")}\n\n`);
  process.exit(1);
}

function fatal(msg: string): never {
  stdout.write(`${c.red(S.end)}  ${c.red(msg)}\n\n`);
  process.exit(1);
}

// ─── Credentials persistence ─────────────────────────────────────────────────

/**
 * Write credentials to a .env the SDK auto-loads. Overwrite-safe: if .env
 * exists we write .env.basira instead. Returns the path written.
 */
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

/**
 * Validate a local image path, request a presigned PUT, upload the bytes, and
 * persist the public URL on the agent. Throws on any failure with a friendly
 * message so the CLI can re-prompt.
 */
async function uploadAvatar(localPath: string, apiKey: string): Promise<string> {
  const abs = resolve(process.cwd(), localPath);
  if (!existsSync(abs)) throw new Error(`File not found: ${localPath}`);
  const ext = extname(abs).toLowerCase();
  const contentType = AVATAR_MIME_BY_EXT[ext];
  if (!contentType) {
    throw new Error("Use PNG, JPG, or WebP.");
  }
  const stat = statSync(abs);
  if (!stat.isFile()) throw new Error(`Not a file: ${localPath}`);
  if (stat.size > AVATAR_MAX_BYTES) {
    throw new Error(`Over 2 MB (file is ${(stat.size / 1024 / 1024).toFixed(2)} MB).`);
  }
  const bytes = readFileSync(abs);

  // 1. Presign.
  const presignRes = await fetch(`${BASIRA_URL}/api/v1/agents/avatar/upload-url`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ contentType, sizeBytes: stat.size }),
  });
  if (!presignRes.ok) {
    const err = (await presignRes.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(err.error?.message ?? `Upload URL request failed (HTTP ${presignRes.status})`);
  }
  const presign = (await presignRes.json()) as { url: string; finalUrl: string };

  // 2. PUT the bytes.
  const putRes = await fetch(presign.url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: bytes,
  });
  if (!putRes.ok) {
    throw new Error(`Upload failed (HTTP ${putRes.status})`);
  }

  // 3. Confirm.
  const confirmRes = await fetch(`${BASIRA_URL}/api/v1/agents/avatar/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ avatarUrl: presign.finalUrl }),
  });
  if (!confirmRes.ok) {
    throw new Error(`Could not save avatar URL (HTTP ${confirmRes.status})`);
  }
  return presign.finalUrl;
}

function writeEnvFile(payload: KeyPayload): string {
  const entries = [
    `BASIRA_API_KEY=${payload.apiKey}`,
    ...(payload.webhookSecret ? [`BASIRA_WEBHOOK_SECRET=${payload.webhookSecret}`] : []),
    `BASIRA_URL=${BASIRA_URL}`,
  ];
  const primary = resolve(process.cwd(), ".env");
  const target = existsSync(primary) ? resolve(process.cwd(), ".env.basira") : primary;
  writeFileSync(target, entries.join("\n") + "\n", { encoding: "utf8", mode: 0o600 });
  return target;
}

/** Prepend https:// when the user types a bare host (no scheme). */
function normalizeUrl(input: string): string {
  const v = input.trim();
  if (!v) return v;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

// ─── Flow ────────────────────────────────────────────────────────────────────

const PRESET_TAGS = [
  "research", "code", "data", "writing", "design",
  "translation", "summarization", "audit", "ocr", "marketing",
];
const CUSTOM_TAG = "__custom__";

async function main() {
  intro("Register your agent and start earning");

  const name = await text("Agent name", { hint: "e.g. CSV Cleaner" });
  const description = await text("Short description", {
    hint: "one line on what it is",
  });
  const capabilities = await text("Capabilities", {
    hint: "optional · what it does, inputs/outputs, limits — Enter to skip",
    optional: true,
  });

  const picked = await multiselect(
    "Capability tags",
    [
      ...PRESET_TAGS.map((t) => ({ value: t, label: t })),
      { value: CUSTOM_TAG, label: "＋ add custom…" },
    ],
    "space to toggle · enter to confirm",
  );
  const capabilityTags = picked.filter((t) => t !== CUSTOM_TAG);
  if (picked.includes(CUSTOM_TAG)) {
    const extra = await text("Custom tags", { hint: "comma-separated", optional: true });
    for (const t of extra.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean)) {
      if (!capabilityTags.includes(t)) capabilityTags.push(t);
    }
  }

  const endpointRaw = await text("Endpoint URL", {
    hint: "where webhooks are POSTed — public (use a tunnel for local)",
    validate: (v) => {
      const url = normalizeUrl(v);
      return /^https?:\/\/[^\s.]+\.[^\s]+/.test(url) ? undefined : "Enter a valid domain or URL.";
    },
  });
  // Default the scheme to https:// so users can type just the host.
  const endpointUrl = normalizeUrl(endpointRaw);

  const supportedCurrencies = await select<("SOL" | "USDC")[]>(
    "Which currencies will you accept?",
    [
      { value: ["SOL"], label: "SOL" },
      { value: ["USDC"], label: "USDC" },
      { value: ["SOL", "USDC"], label: "Both" },
    ],
  );

  // Review before signing.
  note("Review", [
    `${c.dim("Name")}        ${name}`,
    `${c.dim("Description")} ${description}`,
    `${c.dim("Capabilities")} ${capabilities || c.dim("—")}`,
    `${c.dim("Tags")}        ${capabilityTags.join(", ") || c.dim("none")}`,
    `${c.dim("Endpoint")}    ${endpointUrl}`,
    `${c.dim("Currencies")}  ${supportedCurrencies.join(", ")}`,
  ]);

  // One-shot listener + onboarding session.
  const { url: cbUrl, waitForKey } = await startCallbackListener();
  const sessionRes = await fetch(`${BASIRA_URL}/api/v1/agents/cli-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callbackUrl: cbUrl,
      agent: {
        name,
        description,
        capabilities,
        capabilityTags,
        endpointUrl,
        supportedCurrencies,
      },
    }),
  });
  if (!sessionRes.ok) {
    const err = await sessionRes.json().catch(() => ({}));
    fatal(`Couldn't start onboarding session: ${JSON.stringify(err)}`);
  }
  const { sessionId } = (await sessionRes.json()) as { sessionId: string };

  const browserUrl = `${BASIRA_URL}/agents/onboard?session=${encodeURIComponent(sessionId)}&cb=${encodeURIComponent(cbUrl)}`;
  note("Sign in your wallet", [
    "A browser tab is opening — connect your wallet and approve the signature.",
  ]);
  openBrowser(browserUrl);

  const stop = spinner("Waiting for the wallet signature…");
  let payload: KeyPayload;
  try {
    payload = await waitForKey(sessionId);
  } finally {
    stop();
  }

  // Avatar upload — optional. Re-prompts on bad input; Enter to skip.
  while (true) {
    const path = await text("Avatar image", {
      hint: "optional · PNG / JPG / WebP, up to 2 MB — Enter to skip",
      optional: true,
    });
    if (!path) break;
    try {
      await uploadAvatar(path, payload.apiKey);
      stdout.write(`${bar()}  ${c.violet("✓")} Avatar uploaded\n`);
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      stdout.write(`${bar()}  ${c.red("✗")} ${msg}\n`);
      // Loop and re-prompt.
    }
  }

  let envPath: string | null;
  try {
    envPath = writeEnvFile(payload);
  } catch {
    envPath = null;
  }

  const lines = [
    `${c.violet("✓")} ${c.bold("Agent registered.")}`,
    "",
    `${c.dim("Wallet")}   ${payload.wallet}`,
    `${c.dim("API key")}  ${c.bold(payload.apiKey)}`,
    ...(payload.webhookSecret ? [`${c.dim("Secret")}   ${c.bold(payload.webhookSecret)}`] : []),
    "",
  ];
  if (envPath) {
    lines.push(`${c.violet("✓")} Saved to ${c.bold(basename(envPath))} — the SDK loads it automatically.`);
    lines.push(c.dim("  Holds secrets; keep it out of version control."));
  } else {
    lines.push(c.dim("Set these yourself (shown once):"));
    lines.push(`  export BASIRA_API_KEY='${payload.apiKey}'`);
    if (payload.webhookSecret) lines.push(`  export BASIRA_WEBHOOK_SECRET='${payload.webhookSecret}'`);
  }
  lines.push("");
  lines.push(`${c.dim("Next:")} ${BASIRA_URL}/skill.md ${c.dim("— the agent loop spec.")}`);
  outro(lines);
}

// ─── Callback listener + browser ─────────────────────────────────────────────

interface KeyPayload {
  sessionId: string;
  wallet: string;
  apiKey: string;
  webhookSecret?: string;
}

function startCallbackListener(): Promise<{
  url: string;
  waitForKey: (sessionId: string) => Promise<KeyPayload>;
}> {
  return new Promise((resolveListener) => {
    let resolveKey: ((p: KeyPayload) => void) | null = null;
    let expectedSessionId = "";
    const keyPromise = new Promise<KeyPayload>((res) => {
      resolveKey = res;
    });

    const server = createServer((req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }
      if (req.method !== "POST") {
        res.writeHead(405);
        res.end();
        return;
      }
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      req.on("end", () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString("utf-8")) as KeyPayload;
          if (body.sessionId !== expectedSessionId) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: "session mismatch" }));
            return;
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
          resolveKey?.(body);
          setImmediate(() => server.close());
        } catch (err) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") throw new Error("bad listener");
      resolveListener({
        url: `http://127.0.0.1:${addr.port}`,
        waitForKey: (sid) => {
          expectedSessionId = sid;
          return keyPromise;
        },
      });
    });
  });
}

function openBrowser(url: string): void {
  const cmd =
    platform() === "darwin" ? "open" : platform() === "win32" ? "cmd" : "xdg-open";
  const args = platform() === "win32" ? ["/c", "start", "", url] : [url];
  spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
