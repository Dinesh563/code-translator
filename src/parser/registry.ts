import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import type { SupportedLanguage, UnitType } from "./types.js";
import { ParseError } from "./types.js";

/**
 * Per-language configuration: where to find the compiled grammar, and how to
 * map that grammar's AST node types onto our {@link UnitType} vocabulary.
 */
export interface LanguageSpec {
  readonly language: SupportedLanguage;
  /** Absolute path to the grammar's `.wasm` file. */
  readonly wasmPath: string;
  /** Grammar node types that should become top-level units. */
  readonly topLevelNodeTypes: ReadonlyMap<string, UnitType>;
  /** Grammar node type for a class body whose children are methods. */
  readonly classBodyNodeType: string;
  /** Grammar node types inside a class body that are methods. */
  readonly methodNodeTypes: ReadonlySet<string>;
  /** AST field name that holds a construct's identifier. */
  readonly nameField: string;
}

/**
 * Resolves the directory holding the prebuilt grammar `.wasm` files.
 * After `tsup` bundles to `dist/`, a sibling `grammars/` dir is expected
 * (populated by the postinstall script). In dev we fall back to node_modules.
 */
function resolveGrammarsDir(): string {
  const moduleDir: string = dirname(fileURLToPath(import.meta.url));
  // dist/index.js -> ../grammars ; src/parser/registry.ts -> ../../grammars
  const candidates: readonly string[] = [
    resolve(moduleDir, "..", "grammars"),
    resolve(moduleDir, "..", "..", "grammars"),
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) {
      return dir;
    }
  }
  // Final fallback: the build plan's expected location.
  return candidates[0] ?? moduleDir;
}

const GRAMMARS_DIR: string = resolveGrammarsDir();

const TYPESCRIPT_SPEC: LanguageSpec = {
  language: "typescript",
  wasmPath: resolve(GRAMMARS_DIR, "tree-sitter-typescript.wasm"),
  topLevelNodeTypes: new Map<string, UnitType>([
    ["function_declaration", "function"],
    ["class_declaration", "class"],
  ]),
  classBodyNodeType: "class_body",
  methodNodeTypes: new Set<string>(["method_definition"]),
  nameField: "name",
};

const PYTHON_SPEC: LanguageSpec = {
  language: "python",
  wasmPath: resolve(GRAMMARS_DIR, "tree-sitter-python.wasm"),
  topLevelNodeTypes: new Map<string, UnitType>([
    ["function_definition", "function"],
    ["class_definition", "class"],
  ]),
  classBodyNodeType: "block",
  methodNodeTypes: new Set<string>(["function_definition"]),
  nameField: "name",
};

const EXTENSION_TO_SPEC: ReadonlyMap<string, LanguageSpec> = new Map<string, LanguageSpec>([
  [".ts", TYPESCRIPT_SPEC],
  [".tsx", TYPESCRIPT_SPEC],
  [".mts", TYPESCRIPT_SPEC],
  [".cts", TYPESCRIPT_SPEC],
  [".py", PYTHON_SPEC],
  [".pyi", PYTHON_SPEC],
]);

/**
 * Looks up the {@link LanguageSpec} for a file extension (including the dot).
 *
 * @throws {ParseError} if the extension is not supported.
 */
export function specForExtension(extension: string): LanguageSpec {
  const spec: LanguageSpec | undefined = EXTENSION_TO_SPEC.get(extension.toLowerCase());
  if (spec === undefined) {
    const supported: string = [...EXTENSION_TO_SPEC.keys()].join(", ");
    throw new ParseError(
      `Unsupported file type "${extension}". Supported extensions: ${supported}.`,
    );
  }
  return spec;
}
