import { xxh64 } from "@node-rs/xxhash";

/**
 * Generate a stable hex digest for a model alias.
 * Uses xxhash64 for speed; returns a 64-char hex string (zero-padded)
 * prefixed with "sha256:" when used in Ollama responses.
 */
export function modelDigest(alias: string): string {
  const hash = xxh64(Buffer.from(alias)).toString(16);
  return hash.padStart(16, "0").padEnd(64, "0");
}

/** ISO timestamp captured at process start — used for stable `modified_at`. */
export const startupTimestamp = new Date().toISOString();
