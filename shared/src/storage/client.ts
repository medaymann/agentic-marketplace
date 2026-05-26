import { S3Client } from "@aws-sdk/client-s3";

let client: S3Client | null = null;

export function isMockMode(): boolean {
  return !process.env["R2_ENDPOINT"];
}

export function getS3Client(): S3Client {
  if (client) return client;
  const endpoint = process.env["R2_ENDPOINT"];
  const accessKeyId = process.env["R2_ACCESS_KEY_ID"] ?? "";
  const secretAccessKey = process.env["R2_SECRET_ACCESS_KEY"] ?? "";
  const region = "auto";

  client = new S3Client({
    ...(endpoint ? { endpoint } : {}),
    region,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
  return client;
}

export function getBucket(): string {
  return process.env["R2_BUCKET"] ?? "basira-deliverables-dev";
}

/**
 * Base URL for PUBLICLY readable objects (no auth). The S3 API endpoint
 * (R2_ENDPOINT) requires SigV4 on every request, so it can't be used in an
 * <img src> or a plain browser fetch. R2 serves public reads from a separate
 * r2.dev subdomain (or a custom domain) — set R2_PUBLIC_BASE_URL to that.
 * Falls back to the S3 endpoint only for mock/dev where nothing is actually
 * served.
 */
export function getPublicBase(): string {
  const publicBase = process.env["R2_PUBLIC_BASE_URL"];
  if (publicBase) return publicBase.replace(/\/$/, "");
  const endpoint = process.env["R2_ENDPOINT"] ?? "https://mock.invalid";
  return `${endpoint}/${getBucket()}`;
}
