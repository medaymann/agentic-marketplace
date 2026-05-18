import { GetObjectCommand } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { isMockMode, getS3Client, getBucket } from "./client";

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024; // 50 MB

export interface FetchedObject {
  bytes: Buffer;
  sha256: string;
  sizeBytes: number;
  contentType?: string | undefined;
}

/**
 * Streams an R2/S3 object and computes its sha256 in a single pass.
 *
 * - In mock mode (no R2_ENDPOINT configured), returns `null` so callers can
 *   short-circuit. Used by the verify scripts and any local test runs that
 *   don't have real storage credentials.
 * - Streams via `GetObjectCommand`, hashing each chunk as it arrives and
 *   concatenating into a single buffer. Aborts and throws if the running
 *   total exceeds `opts.maxBytes` (defaults to the 50 MB platform cap).
 */
export async function fetchObjectBytes(
  key: string,
  opts: { maxBytes?: number } = {},
): Promise<FetchedObject | null> {
  if (isMockMode()) return null;

  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const res = await getS3Client().send(
    new GetObjectCommand({ Bucket: getBucket(), Key: key }),
  );

  const body = res.Body;
  if (!body) throw new Error(`fetchObjectBytes: empty body for key ${key}`);

  const stream = body as Readable;
  const hash = createHash("sha256");
  const chunks: Buffer[] = [];
  let sizeBytes = 0;

  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    sizeBytes += buf.length;
    if (sizeBytes > maxBytes) {
      throw new Error(
        `fetchObjectBytes: object ${key} exceeds maxBytes (${maxBytes})`,
      );
    }
    hash.update(buf);
    chunks.push(buf);
  }

  return {
    bytes: Buffer.concat(chunks),
    sha256: hash.digest("hex"),
    sizeBytes,
    contentType: res.ContentType,
  };
}
