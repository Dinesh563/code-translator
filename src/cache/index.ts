import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import type { Database as DatabaseInstance, Statement } from "better-sqlite3";
import { hashUnit, normalizeSource } from "./hash.js";

/** Shape of a single persisted cache row. */
export interface CacheRecord {
  readonly hash: string;
  readonly explanation: string;
  /** Unix epoch milliseconds when the row was last written. */
  readonly updatedAt: number;
}

/** Raw row shape as stored in SQLite (snake_case columns). */
interface CacheRow {
  readonly hash: string;
  readonly explanation: string;
  readonly updated_at: number;
}

/** Raised when the cache database cannot be opened or migrated. */
export class CacheError extends Error {
  public override readonly name = "CacheError";

  public constructor(message: string) {
    super(message);
  }
}

/** Default on-disk location for the cache database. */
export function defaultCachePath(): string {
  return join(homedir(), ".cache", "explain-cli", "cache.db");
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS explanations (
  hash       TEXT PRIMARY KEY,
  explanation TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

/**
 * A persistent, hash-keyed store of unit explanations backed by SQLite.
 *
 * Keys are SHA-256 digests of normalized unit source (see {@link hashUnit}),
 * so unchanged units hit the cache across runs and cosmetic edits don't.
 */
export class ExplanationCache {
  readonly #db: DatabaseInstance;
  readonly #getStmt: Statement<[string], CacheRow>;
  readonly #putStmt: Statement<[string, string, number]>;

  private constructor(db: DatabaseInstance) {
    this.#db = db;
    this.#db.pragma("journal_mode = WAL");
    this.#db.exec(SCHEMA);
    this.#getStmt = this.#db.prepare<[string], CacheRow>(
      "SELECT hash, explanation, updated_at FROM explanations WHERE hash = ?",
    );
    this.#putStmt = this.#db.prepare<[string, string, number]>(
      "INSERT INTO explanations (hash, explanation, updated_at) VALUES (?, ?, ?) " +
        "ON CONFLICT(hash) DO UPDATE SET explanation = excluded.explanation, " +
        "updated_at = excluded.updated_at",
    );
  }

  /**
   * Opens (creating if needed) a cache at the given path, or the default
   * location. Parent directories are created automatically.
   *
   * @throws {CacheError} if the database cannot be opened.
   */
  public static open(path: string = defaultCachePath()): ExplanationCache {
    try {
      mkdirSync(dirname(path), { recursive: true });
      const db: DatabaseInstance = new Database(path);
      return new ExplanationCache(db);
    } catch (cause: unknown) {
      const detail: string = cause instanceof Error ? cause.message : String(cause);
      throw new CacheError(`Could not open cache at ${path}: ${detail}`);
    }
  }

  /** Looks up an explanation by raw hash. Returns `undefined` on a miss. */
  public get(hash: string): CacheRecord | undefined {
    const row: CacheRow | undefined = this.#getStmt.get(hash);
    if (row === undefined) {
      return undefined;
    }
    return { hash: row.hash, explanation: row.explanation, updatedAt: row.updated_at };
  }

  /** Convenience: hash a unit's source, then look it up. */
  public getByCode(code: string): CacheRecord | undefined {
    return this.get(hashUnit(code));
  }

  /** Stores (or replaces) an explanation under a raw hash. */
  public put(hash: string, explanation: string): void {
    this.#putStmt.run(hash, explanation, Date.now());
  }

  /** Convenience: hash a unit's source, then store its explanation. */
  public putByCode(code: string, explanation: string): void {
    this.put(hashUnit(code), explanation);
  }

  /** Number of cached explanations. */
  public size(): number {
    const row: { readonly n: number } | undefined = this.#db
      .prepare<[], { readonly n: number }>("SELECT COUNT(*) AS n FROM explanations")
      .get();
    return row?.n ?? 0;
  }

  /** Closes the underlying database handle. Safe to call once. */
  public close(): void {
    this.#db.close();
  }
}

export { hashUnit, normalizeSource } from "./hash.js";
