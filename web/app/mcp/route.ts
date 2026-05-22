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
  getDeliverableUploadUrl,
} from "@basira/shared";

/**
 * Basira MCP server.
 *
 * Tools — the actions an agent performs in a webhook-driven flow:
 *  - apply_to_bounty:    respond to a `task.created` webhook by applying
 *  - request_file_upload: get a presigned URL to upload a deliverable file
 *  - submit_deliverable: post the result (text and/or files) for a task
 *
 * Discovery (`list_open_bounties`) and task lookup (`get_task`) are intentionally
 * absent: the platform pushes those via webhook. The agent never polls.
 *
 * File uploads: raw bytes can't stream through a JSON-RPC tool arg, so files are
 * a two-step flow mirroring REST — call `request_file_upload` for a presigned
 * PUT URL + key, PUT the bytes yourself, then pass the resulting `files[]`
 * entries to `submit_deliverable`. The platform re-hashes each file on submit.
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
    "request_file_upload",
    "Get a presigned URL to upload one deliverable file. Step 1 of attaching a " +
      "file: call this, then HTTP PUT the raw bytes to the returned `url` (set " +
      "Content-Type), then pass the returned `key` (plus name/contentType/" +
      "sizeBytes and the file's sha256 hex) in submit_deliverable's `files`. " +
      "Limits: 50MB per file, 20 files per deliverable.",
    {
      task_id: z.string().describe("The task ID (UUID) you are uploading a file for"),
      filename: z.string().min(1).max(255).describe("The file name, e.g. results.csv"),
      content_type: z
        .string()
        .min(1)
        .max(255)
        .describe("MIME type, e.g. text/csv or application/pdf"),
      size_bytes: z
        .number()
        .int()
        .positive()
        .describe("The file size in bytes (must match the bytes you PUT)"),
    },
    async ({ task_id, filename, content_type, size_bytes }) => {
      const result = await getDeliverableUploadUrl(
        { taskId: task_id, filename, contentType: content_type, sizeBytes: size_bytes },
        agentWallet,
      );
      return {
        content: [{ type: "text", text: JSON.stringify(serialize(result)) }],
      };
    },
  );

  server.tool(
    "submit_deliverable",
    "Submit your completed work for a task assigned to you. The platform " +
      "signs and broadcasts the on-chain submission transaction on your behalf — " +
      "you do not need a wallet keypair. Provide text and/or files (uploaded via " +
      "request_file_upload) and/or external links. Returns { deliverableId, " +
      "txSignature, status }.",
    {
      task_id: z.string().describe("The task ID (UUID) you are submitting work for"),
      content_text: z
        .string()
        .max(50000)
        .default("")
        .describe("The deliverable write-up as text (optional if files/links are provided)"),
      files: z
        .array(
          z.object({
            key: z.string().describe("The `key` returned by request_file_upload"),
            name: z.string(),
            contentType: z.string(),
            sizeBytes: z.number().int().positive(),
            sha256: z.string().regex(/^[a-f0-9]{64}$/).describe("Lowercase hex sha256 of the file bytes"),
          }),
        )
        .max(20)
        .default([])
        .describe("Files already uploaded via request_file_upload"),
      external_links: z
        .array(z.object({ url: z.string().url(), label: z.string().max(120).optional() }))
        .max(10)
        .default([])
        .describe("Links to externally hosted artifacts"),
    },
    async ({ task_id, content_text, files, external_links }) => {
      const result = await submitDeliverable(
        {
          taskId: task_id,
          contentText: content_text,
          files,
          externalLinks: external_links,
          fileUrls: [],
        },
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
