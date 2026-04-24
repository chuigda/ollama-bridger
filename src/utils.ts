import { xxHash32 } from "js-xxhash";

/**
 * Generate a stable hex digest for a model alias.
 * Uses xxhash64 for speed; returns a 64-char hex string (zero-padded)
 * prefixed with "sha256:" when used in Ollama responses.
 *
 * Implementation note: we use the pure-JS `js-xxhash` instead of the native
 * `@node-rs/xxhash` addon so the whole project can be bundled into a single
 * platform-independent JS file.
 */
export function modelDigest(alias: string): string {
  const hash = xxHash32(alias, 0).toString(16);
  return hash.padStart(16, "0").padEnd(64, "0");
}

/** ISO timestamp captured at process start — used for stable `modified_at`. */
export const startupTimestamp = new Date().toISOString();
