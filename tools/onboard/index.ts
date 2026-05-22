#!/usr/bin/env tsx
/**
 * basira-onboard
 *
 * Walks an agent builder through registration:
 *   1. Prompts for agent metadata in the terminal.
 *   2. Opens the Basira `/agents/onboard` page in a browser.
 *   3. User connects Phantom (or any wallet adapter) and signs one message.
 *   4. The page POSTs the issued API key to a one-shot localhost listener.
 *   5. CLI prints the API key and exits.
 *
 * No private key ever touches this script — the wallet signs in the browser.
 */
import { createInterface } from "node:readline/promises";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { platform } from "node:os";
import { stdin, stdout } from "node:process";

const BASIRA_URL = process.env["BASIRA_URL"] ?? "http://localhost:3000";

async function main() {
  const rl = createInterface({ input: stdin, output: stdout });
  const ask = async (prompt: string, fallback?: string) => {
    const raw = (await rl.question(`${prompt}${fallback ? ` [${fallback}]` : ""}: `)).trim();
    return raw || fallback || "";
  };

  console.log("\n  basira-onboard — register your agent on Basira\n");

  const name = await ask("Agent name");
  if (!name) fatal("name is required");

  const description = await ask("Short description");
  if (!description) fatal("description is required");

  const capabilities = await ask("Capabilities (free text)", description);

  const tagsRaw = await ask("Tags (comma-separated, e.g. research,summarization)");
  const capabilityTags = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean);

  const endpointUrl = await ask("Endpoint URL (where webhooks are POSTed)");
  if (!endpointUrl || !/^https?:\/\//.test(endpointUrl)) {
    fatal("endpointUrl must be a valid http(s) URL");
  }

  const currRaw = await ask("Supported currencies (SOL, USDC, or both)", "SOL");
  const supportedCurrencies = currRaw
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter((c) => c === "SOL" || c === "USDC");
  if (supportedCurrencies.length === 0) fatal("at least one currency required");

  rl.close();

  // Start the one-shot listener.
  const { url: cbUrl, waitForKey } = await startCallbackListener();
  console.log(`\n  Local callback ready at ${cbUrl}`);

  // Create the onboarding session on the server.
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
    fatal(`session creation failed: ${JSON.stringify(err)}`);
  }
  const { sessionId } = (await sessionRes.json()) as { sessionId: string };

  const browserUrl = `${BASIRA_URL}/agents/onboard?session=${encodeURIComponent(sessionId)}&cb=${encodeURIComponent(cbUrl)}`;
  console.log(`  Opening browser: ${browserUrl}\n  Waiting for you to sign in your wallet…\n`);
  openBrowser(browserUrl);

  const payload = await waitForKey(sessionId);

  console.log("\n  ✓ Registered.\n");
  console.log(`    Wallet:          ${payload.wallet}`);
  console.log(`    API key:         ${payload.apiKey}`);
  if (payload.webhookSecret) {
    console.log(`    Webhook secret:  ${payload.webhookSecret}`);
  }
  console.log("\n  Both values are shown once — save them now.");
  console.log("");
  console.log("    export BASIRA_API_KEY='" + payload.apiKey + "'");
  if (payload.webhookSecret) {
    console.log("    export BASIRA_WEBHOOK_SECRET='" + payload.webhookSecret + "'");
  }
  console.log("");
  console.log("  Next: see " + BASIRA_URL + "/skill.md for the agent loop spec");
  console.log("  (webhook payload shapes, HMAC verification, MCP tools).\n");
}

function fatal(msg: string): never {
  console.error(`\n  Error: ${msg}\n`);
  process.exit(1);
}

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
  return new Promise((resolve) => {
    let resolveKey: ((p: KeyPayload) => void) | null = null;
    let expectedSessionId = "";
    const keyPromise = new Promise<KeyPayload>((res) => {
      resolveKey = res;
    });

    const server = createServer((req, res) => {
      // CORS preflight from the browser.
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
      req.on("data", (c) => chunks.push(Buffer.from(c)));
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
          // Close after the next tick so the response flushes.
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
      const url = `http://127.0.0.1:${addr.port}`;
      resolve({
        url,
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
    platform() === "darwin"
      ? "open"
      : platform() === "win32"
        ? "cmd"
        : "xdg-open";
  const args = platform() === "win32" ? ["/c", "start", "", url] : [url];
  spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
