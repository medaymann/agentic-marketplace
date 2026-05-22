import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { requireApiKey } from "@/lib/auth";
import { serialize } from "@/lib/serialize";
import {
  applyToBounty,
  submitDeliverable,
} from "@basira/shared";

/**
 * Basira MCP server.
 *
 * Two tools — the only actions an agent performs in a webhook-driven flow:
 *  - apply_to_bounty:    respond to a `task.created` webhook by applying
 *  - submit_deliverable: post the result for an assigned task
 *
 * Discovery (`list_open_bounties`) and task lookup (`get_task`) are intentionally
 * absent: the platform pushes those via webhook. The agent never polls.
 *
 * Auth: the wallet is resolved per-request from the `Authorization: Bearer`
 * header via `requireApiKey`, so the server is built fresh inside each request.
 * Stateless transport — one JSON-RPC exchange per HTTP request.
 */

function buildServer(agentWallet: string): McpServer {
  const server = new McpServer({ name: "basira", version: "1.0.0" });

  server.tool(
    "apply_to_bounty",
    "Apply to an open bounty task. Call this when notified of a new bounty you can fulfill.",
    {
      task_id: z.string().describe("The task ID (UUID) of the bounty to apply to"),
      message: z
        .string()
        .min(1)
        .max(2000)
        .describe("A short message to the poster describing how you'll fulfill the task"),
    },
    async ({ task_id, message }) => {
      await applyToBounty({ taskId: task_id, message }, agentWallet);
      return {
        content: [
          { type: "text", text: JSON.stringify({ status: "applied", taskId: task_id }) },
        ],
      };
    },
  );

  server.tool(
    "submit_deliverable",
    "Submit your completed work for a task assigned to you. The platform " +
      "signs and broadcasts the on-chain submission transaction on your behalf — " +
      "you do not need a wallet keypair. Returns { deliverableId, txSignature, status }.",
    {
      task_id: z.string().describe("The task ID (UUID) you are submitting work for"),
      content_text: z
        .string()
        .min(1)
        .max(50000)
        .describe("The deliverable content — your completed work as text"),
    },
    async ({ task_id, content_text }) => {
      const result = await submitDeliverable(
        { taskId: task_id, contentText: content_text, files: [], externalLinks: [], fileUrls: [] },
        agentWallet,
      );
      return {
        content: [{ type: "text", text: JSON.stringify(serialize(result)) }],
      };
    },
  );

  return server;
}

export async function POST(req: NextRequest) {
  let agentWallet: string;
  try {
    ({ wallet: agentWallet } = await requireApiKey(req));
  } catch {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: { code: -32001, message: "Unauthorized — provide Authorization: Bearer <apiKey>" },
        id: null,
      },
      { status: 401 },
    );
  }

  const server = buildServer(agentWallet);
  // Stateless mode: omit sessionIdGenerator entirely. One JSON-RPC exchange
  // per HTTP request, no session validation.
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
  });

  await server.connect(transport);
  return transport.handleRequest(req);
}
