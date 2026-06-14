import Anthropic from "@anthropic-ai/sdk";
import type { Message, TextBlock } from "@anthropic-ai/sdk/resources/messages";
import type { CodeUnit } from "../parser/index.js";
import { hashUnit, type ExplanationCache } from "../cache/index.js";
import { buildUserPrompt, SYSTEM_PROMPT } from "./prompt.js";

/** Default model: Haiku, per the build plan. Overridable via `--model`. */
export const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

/** Upper bound on tokens per explanation. One short paragraph is plenty. */
const MAX_TOKENS = 512;

/** Retry policy for transient API failures (rate limits, overload, 5xx). */
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500;

/** HTTP status codes that are worth retrying. */
const RETRYABLE_STATUSES: ReadonlySet<number> = new Set<number>([408, 429, 500, 502, 503, 529]);

/** Reads a numeric `status` off an unknown error, if present. */
function statusOf(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status: unknown = (error as { readonly status: unknown }).status;
    return typeof status === "number" ? status : undefined;
  }
  return undefined;
}

/** Resolves after the given delay. */
function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Raised when the translation API call fails or returns no usable text. */
export class TranslateError extends Error {
  public override readonly name = "TranslateError";

  public constructor(message: string) {
    super(message);
  }
}

/** A unit paired with its freshly produced or cached explanation. */
export interface TranslatedUnit {
  readonly unit: CodeUnit;
  readonly explanation: string;
  /** True when served from cache; false when freshly generated. */
  readonly fromCache: boolean;
}

/** Options controlling a translation run. */
export interface TranslateOptions {
  readonly apiKey: string;
  readonly cache: ExplanationCache;
  /** Model identifier; defaults to {@link DEFAULT_MODEL}. */
  readonly model?: string;
  /** When true, ignore cache hits and re-translate every unit. */
  readonly force?: boolean;
  /** Optional progress callback, invoked once per unit as it resolves. */
  readonly onProgress?: (done: number, total: number, unit: CodeUnit) => void;
}

/** Extracts and joins the text blocks from a model response. */
function textFromMessage(message: Message): string {
  const text: string = message.content
    .filter((block): block is TextBlock => block.type === "text")
    .map((block: TextBlock): string => block.text)
    .join("")
    .trim();
  return text;
}

/** Translates a single unit via the API, retrying transient failures. */
async function translateOne(client: Anthropic, model: string, unit: CodeUnit): Promise<string> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const message: Message = await client.messages.create({
        model,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserPrompt(unit) }],
      });

      const explanation: string = textFromMessage(message);
      if (explanation.length === 0) {
        throw new TranslateError(`Model returned an empty explanation for "${unit.name}".`);
      }
      return explanation;
    } catch (cause: unknown) {
      lastError = cause;
      const status: number | undefined = statusOf(cause);
      const retryable: boolean = status !== undefined && RETRYABLE_STATUSES.has(status);
      if (!retryable || attempt === MAX_ATTEMPTS) {
        break;
      }
      // Exponential backoff: 500ms, 1000ms, ...
      await delay(BASE_BACKOFF_MS * 2 ** (attempt - 1));
    }
  }

  const detail: string = lastError instanceof Error ? lastError.message : String(lastError);
  throw new TranslateError(`API request failed for "${unit.name}": ${detail}`);
}

/**
 * Produces a plain-English explanation for every unit, using the cache to
 * skip unchanged units. Fresh explanations are written back to the cache as
 * they return. Results preserve input order.
 *
 * On a re-run with no source changes, every unit hits the cache and zero API
 * calls are made.
 *
 * @throws {TranslateError} if any required API call fails.
 */
export async function translate(
  units: readonly CodeUnit[],
  options: TranslateOptions,
): Promise<readonly TranslatedUnit[]> {
  const { apiKey, cache, model = DEFAULT_MODEL, force = false, onProgress } = options;
  const client: Anthropic = new Anthropic({ apiKey });

  const results: TranslatedUnit[] = [];
  const total: number = units.length;
  let done = 0;

  for (const unit of units) {
    const hash: string = hashUnit(unit.code);

    if (!force) {
      const cached = cache.get(hash);
      if (cached !== undefined) {
        results.push({ unit, explanation: cached.explanation, fromCache: true });
        onProgress?.((done += 1), total, unit);
        continue;
      }
    }

    const explanation: string = await translateOne(client, model, unit);
    cache.put(hash, explanation);
    results.push({ unit, explanation, fromCache: false });
    onProgress?.((done += 1), total, unit);
  }

  return results;
}
