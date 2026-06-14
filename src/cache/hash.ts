import { createHash } from "node:crypto";

/**
 * Normalizes source before hashing so cosmetic edits don't bust the cache:
 * trailing whitespace is stripped from every line and trailing blank lines
 * are removed. Line endings are unified to `\n`. The semantics of the code
 * are unaffected by any of these.
 */
export function normalizeSource(code: string): string {
  return code
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line: string): string => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n+$/, "");
}

/**
 * Computes a stable SHA-256 hex digest of a code unit's normalized source.
 * The same logical code always yields the same hash across runs and machines.
 */
export function hashUnit(code: string): string {
  return createHash("sha256").update(normalizeSource(code), "utf8").digest("hex");
}
