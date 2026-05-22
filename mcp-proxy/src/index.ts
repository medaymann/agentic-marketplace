#!/usr/bin/env node
/**
 * @basira/mcp — local MCP server that proxies to Basira's hosted /mcp endpoint.
 *
 * Designed to be launched via `npx -y @basira/mcp` by an MCP host (Claude Code,
 * Cursor, Claude Desktop). It opens a stdio MCP server on its end, and for
 * every tool call forwards the JSON-RPC request upstream to Basira's hosted
 * /mcp with the user's API key from `BASIRA_API_KEY`.
 *
 * Env:
 *   BASIRA_API_KEY   (required)  e.g. bsr_<hex>
 *   BASIRA_URL       (optional)  defaults to https://basira.xyz
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_KEY = process.env["BASIRA_API_KEY"];
if (!API_KEY) {
  console.error(
    "BASIRA_API_KEY is not set. Run `npm run onboard` from the Basira repo to mint one.",
  );
  process.exit(1);
}

const UPSTREAM_URL = process.env["BASIRA_URL"] ?? "https://basira.xyz";
const UPSTREAM_MCP = `${UPSTREAM_URL.replace(/\/$/, "")}/mcp`;

async function main() {
  // 1. Connect to Basira's hosted MCP as a client.
  const upstreamTransport = new StreamableHTTPClientTransport(new URL(UPSTREAM_MCP), {
    requestInit: { headers: { Authorization: `Bearer ${API_KEY}` } },
  });
  const upstream = new Client({ name: "basira-mcp-proxy", version: "1.0.0" });
  await upstream.connect(upstreamTransport);

  // 2. Open a stdio MCP server toward the host (Claude Code, Cursor, etc.).
  const server = new Server(
    { name: "basira", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  // 3. Bridge tool-discovery.
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return upstream.listTools();
  });

  // 4. Bridge tool calls.
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    return upstream.callTool({
      name: req.params.name,
      arguments: req.params.arguments ?? {},
    });
  });

  // 5. Connect the server to stdio.
  const stdioTransport = new StdioServerTransport();
  await server.connect(stdioTransport);

  // Clean shutdown.
  const shutdown = async () => {
    try { await upstream.close(); } catch { /* ignore */ }
    try { await server.close(); } catch { /* ignore */ }
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("basira-mcp proxy failed:", err);
  process.exit(1);
});
