import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { ConfigError, getConfig, type AppConfig } from "./config.js";
import { parse, ParseError, type CodeUnit } from "./parser/index.js";
import { CacheError, ExplanationCache } from "./cache/index.js";
import {
  DEFAULT_MODEL,
  translate,
  TranslateError,
  type TranslatedUnit,
} from "./translate/index.js";
import { defaultOutputPath, render, RenderError } from "./render/index.js";
import { Progress } from "./progress.js";

/**
 * Options accepted by the `explain` command.
 * Mirrors the flags registered in {@link buildProgram}; kept fully typed so
 * downstream phases consume a known shape rather than Commander's loose record.
 */
export interface ExplainOptions {
  /** Destination path for the rendered output (Phase 4). */
  readonly output?: string;
  /** Model override for translation (Phase 3). */
  readonly model?: string;
  /** Bypass the cache and re-translate everything (Phase 5). */
  readonly force: boolean;
}

interface PackageMeta {
  readonly version: string;
  readonly description: string;
}

/**
 * Reads the CLI's own version and description from package.json so they stay
 * in sync with a single source of truth.
 */
function readPackageMeta(): PackageMeta {
  const here: string = fileURLToPath(import.meta.url);
  const packageJsonPath: string = resolve(here, "..", "..", "package.json");
  const raw: string = readFileSync(packageJsonPath, "utf8");
  const parsed: unknown = JSON.parse(raw);

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("version" in parsed) ||
    !("description" in parsed)
  ) {
    throw new Error("package.json is missing version or description.");
  }

  const { version, description } = parsed as Record<"version" | "description", unknown>;

  if (typeof version !== "string" || typeof description !== "string") {
    throw new Error("package.json version/description must be strings.");
  }

  return { version, description };
}

/**
 * Action handler: parse → translate (cache-aware) → render to markdown.
 * Shows a spinner on a TTY and reports fresh vs cached counts.
 */
async function runExplain(file: string, options: ExplainOptions): Promise<void> {
  const config: AppConfig = getConfig(); // Throws ConfigError if the key is absent.

  const resolvedPath: string = resolve(process.cwd(), file);
  const units: readonly CodeUnit[] = await parse(resolvedPath);

  if (units.length === 0) {
    console.log(`No code units found in ${resolvedPath}. Nothing to explain.`);
    return;
  }

  const cache: ExplanationCache = ExplanationCache.open();
  const progress: Progress = new Progress();
  try {
    console.log(`explain — ${resolvedPath}`);
    console.log(`  model: ${options.model ?? DEFAULT_MODEL}`);
    if (options.force) {
      console.log("  force: cache bypassed");
    }

    const translated: readonly TranslatedUnit[] = await translate(units, {
      apiKey: config.anthropicApiKey,
      cache,
      ...(options.model !== undefined ? { model: options.model } : {}),
      force: options.force,
      onProgress: (doneCount: number, total: number, unit: CodeUnit): void => {
        progress.update(`Translating ${doneCount}/${total}: ${unit.name}`);
      },
    });
    progress.done(); // Clear the spinner line before printing results.

    const freshCount: number = translated.filter((t: TranslatedUnit): boolean => !t.fromCache)
      .length;
    const cachedCount: number = translated.length - freshCount;

    const outputPath: string = options.output ?? defaultOutputPath(resolvedPath);
    const written: string = await render(resolvedPath, translated, outputPath);

    console.log(
      `Done: ${translated.length} unit${translated.length === 1 ? "" : "s"} ` +
        `(${freshCount} fresh, ${cachedCount} cached).`,
    );
    console.log(`Wrote ${written}`);
  } finally {
    progress.done();
    cache.close();
  }
}

/**
 * Constructs the Commander program. Separated from execution so it can be
 * unit-tested and so {@link main} stays a thin entry point.
 */
export function buildProgram(): Command {
  const meta: PackageMeta = readPackageMeta();
  const program = new Command();

  program
    .name("explain")
    .description(meta.description)
    .version(meta.version, "-v, --version", "print the version and exit");

  program
    .command("explain", { isDefault: true })
    .description("Generate a plain-English explanation of a source file.")
    .argument("<file>", "path to the source file to explain")
    .option("-o, --output <path>", "write output to this path")
    .option("-m, --model <name>", "Anthropic model to use")
    .option("-f, --force", "bypass the cache and re-translate everything", false)
    .action(async (file: string, options: ExplainOptions): Promise<void> => {
      await runExplain(file, options);
    });

  return program;
}

/**
 * Parses argv and runs the program, converting known errors into clean,
 * stack-trace-free messages with a non-zero exit code.
 */
export async function main(argv: readonly string[]): Promise<void> {
  try {
    await buildProgram().parseAsync(argv as string[]);
  } catch (error: unknown) {
    if (
      error instanceof ConfigError ||
      error instanceof ParseError ||
      error instanceof CacheError ||
      error instanceof TranslateError ||
      error instanceof RenderError
    ) {
      console.error(`Error: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}
