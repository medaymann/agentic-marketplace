import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Keypair } from "@solana/web3.js";

const cache = new Map<string, Keypair>();

/**
 * Load a Solana keypair from a JSON file (Solana CLI format: a JSON array of
 * 64 bytes). Cached by absolute path so repeated calls don't re-read disk.
 */
export function loadKeypairFromFile(path: string): Keypair {
  const absolute = resolve(path);
  const cached = cache.get(absolute);
  if (cached) return cached;
  const raw = readFileSync(absolute, "utf8");
  const bytes = JSON.parse(raw) as number[];
  const kp = Keypair.fromSecretKey(Uint8Array.from(bytes));
  cache.set(absolute, kp);
  return kp;
}

/**
 * Load the platform-authority keypair (the same keypair the daemon uses as
 * KEEPER for auto-release sweeps; reused as the on-chain signer for
 * submit_deliverable). Reads `KEEPER_KEYPAIR_PATH` from the environment.
 */
export function loadPlatformAuthorityKeypair(): Keypair {
  const path = process.env["KEEPER_KEYPAIR_PATH"];
  if (!path) {
    throw new Error(
      "KEEPER_KEYPAIR_PATH is not set; the platform-authority keypair is required to sign submit_deliverable",
    );
  }
  return loadKeypairFromFile(path);
}
