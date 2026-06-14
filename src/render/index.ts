import { writeFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import type { TranslatedUnit } from "../translate/index.js";

/** Raised when rendered output cannot be written to disk. */
export class RenderError extends Error {
  public override readonly name = "RenderError";

  public constructor(message: string) {
    super(message);
  }
}

/** Maps a source file extension to a markdown code-fence language hint. */
const FENCE_LANGUAGE: ReadonlyMap<string, string> = new Map<string, string>([
  [".ts", "typescript"],
  [".tsx", "tsx"],
  [".mts", "typescript"],
  [".cts", "typescript"],
  [".py", "python"],
  [".pyi", "python"],
]);

/** Chooses a fence language for the given source path. */
function fenceLanguageFor(sourcePath: string): string {
  return FENCE_LANGUAGE.get(extname(sourcePath).toLowerCase()) ?? "";
}

/**
 * Picks the longest run of backticks in the code and returns a fence one
 * longer, so source containing ``` is still fenced correctly.
 */
function fenceFor(code: string): string {
  const runs: readonly string[] = code.match(/`+/g) ?? [];
  let longest = 0;
  for (const run of runs) {
    longest = Math.max(longest, run.length);
  }
  return "`".repeat(Math.max(3, longest + 1));
}

/**
 * Assembles a markdown document: a title, then for each unit a heading, the
 * original code in a fenced block, and its plain-English explanation.
 */
export function renderMarkdown(
  sourcePath: string,
  units: readonly TranslatedUnit[],
): string {
  const language: string = fenceLanguageFor(sourcePath);
  const title: string = basename(sourcePath);

  const sections: string[] = units.map(({ unit, explanation }: TranslatedUnit): string => {
    const fence: string = fenceFor(unit.code);
    const lineRange: string =
      unit.startLine === unit.endLine
        ? `Line ${unit.startLine}`
        : `Lines ${unit.startLine}–${unit.endLine}`;

    return [
      `## ${unit.name}`,
      ``,
      `*${unit.type} · ${lineRange}*`,
      ``,
      `${fence}${language}`,
      unit.code,
      fence,
      ``,
      explanation,
    ].join("\n");
  });

  return [`# Explanation: ${title}`, ``, ...joinSections(sections), ``].join("\n");
}

/** Joins sections with a blank-line separator between them. */
function joinSections(sections: readonly string[]): readonly string[] {
  const out: string[] = [];
  sections.forEach((section: string, index: number): void => {
    if (index > 0) {
      out.push("");
    }
    out.push(section);
  });
  return out;
}

/** Computes the default output path: `<source>.explained.md`. */
export function defaultOutputPath(sourcePath: string): string {
  return `${sourcePath}.explained.md`;
}

/**
 * Renders the units to markdown and writes the file.
 *
 * @returns the path written.
 * @throws {RenderError} if the file cannot be written.
 */
export async function render(
  sourcePath: string,
  units: readonly TranslatedUnit[],
  outputPath: string = defaultOutputPath(sourcePath),
): Promise<string> {
  const markdown: string = renderMarkdown(sourcePath, units);
  try {
    await writeFile(outputPath, markdown, "utf8");
  } catch (cause: unknown) {
    const detail: string = cause instanceof Error ? cause.message : String(cause);
    throw new RenderError(`Could not write output to ${outputPath}: ${detail}`);
  }
  return outputPath;
}
