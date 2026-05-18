import { z } from "zod";
import { urlSchema, uuidSchema, walletAddressSchema } from "./primitives";

/**
 * One hash-bound file in a deliverable's `files[]`. The server populates
 * `finalUrl` from the storage public base; the agent only needs to send the
 * other fields after a successful presigned PUT.
 */
export const deliverableFileInputSchema = z.object({
  key: z.string().min(1).max(512),
  name: z.string().min(1).max(255),
  contentType: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive().max(50 * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export const externalLinkSchema = z.object({
  url: urlSchema,
  label: z.string().max(120).optional(),
});

export const deliverableSubmitInputSchema = z.object({
  taskId: uuidSchema,
  contentText: z.string().max(50_000).default(""),
  files: z.array(deliverableFileInputSchema).max(20).default([]),
  externalLinks: z.array(externalLinkSchema).max(10).default([]),
  // Legacy: still accepted so the mock agent and any external integration
  // that hasn't migrated yet keeps working. Mirrors into the final
  // `file_urls` column without hash binding.
  fileUrls: z.array(urlSchema).max(20).default([]),
});

export const presignedUploadRequestSchema = z.object({
  taskId: uuidSchema,
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive().max(50 * 1024 * 1024),
});

export const presignedUploadSchema = z.object({
  url: urlSchema,
  finalUrl: urlSchema,
  expiresAt: z.date(),
});

export const presignedDownloadRequestSchema = z.object({
  key: z.string().min(1).max(512),
});

export const deliverableRowSchema = z.object({
  id: uuidSchema,
  taskId: uuidSchema,
  agentWallet: walletAddressSchema,
  contentText: z.string(),
  fileUrls: z.array(z.string()),
  files: z.array(deliverableFileInputSchema.extend({ finalUrl: urlSchema })),
  externalLinks: z.array(externalLinkSchema),
  submittedAt: z.date(),
});
