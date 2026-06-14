import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { Language, Node, Parser, Tree } from "web-tree-sitter";
import type { CodeUnit, UnitType } from "./types.js";
import { ParseError } from "./types.js";
import type { LanguageSpec } from "./registry.js";
import { specForExtension } from "./registry.js";

/** Names used for the synthetic top-level bucket and for unnamed nodes. */
const MODULE_LEVEL_NAME = "module-level";
const ANONYMOUS_NAME = "(anonymous)";

let initialized = false;

/** Caches one loaded grammar per language so re-parsing avoids re-reading wasm. */
const languageCache = new Map<string, Language>();

/** Initializes the tree-sitter runtime exactly once per process. */
async function ensureInitialized(): Promise<void> {
  if (!initialized) {
    await Parser.init();
    initialized = true;
  }
}

/** Loads (and caches) the grammar for a given spec. */
async function loadLanguage(spec: LanguageSpec): Promise<Language> {
  const cached: Language | undefined = languageCache.get(spec.wasmPath);
  if (cached !== undefined) {
    return cached;
  }
  let language: Language;
  try {
    language = await Language.load(spec.wasmPath);
  } catch {
    throw new ParseError(
      `Failed to load grammar for ${spec.language} from ${spec.wasmPath}. ` +
        "Run `npm run grammars` to copy the prebuilt parsers.",
    );
  }
  languageCache.set(spec.wasmPath, language);
  return language;
}

/** Reads a node's identifier via the grammar's name field, if present. */
function nameOf(node: Node, spec: LanguageSpec): string {
  const nameNode: Node | null = node.childForFieldName(spec.nameField);
  const text: string | undefined = nameNode?.text;
  return text !== undefined && text.length > 0 ? text : ANONYMOUS_NAME;
}

/** Builds a CodeUnit from a node already classified to a UnitType. */
function toUnit(node: Node, name: string, type: UnitType): CodeUnit {
  return {
    name,
    type,
    code: node.text,
    // tree-sitter rows are 0-based; CodeUnit lines are 1-based inclusive.
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
  };
}

/**
 * Unwraps export/decorator wrappers (e.g. `export function`) to reach the
 * declaration that actually carries a recognised unit type.
 */
function unwrap(node: Node, spec: LanguageSpec): Node {
  let current: Node = node;
  while (!spec.topLevelNodeTypes.has(current.type)) {
    const inner: Node | undefined = current.namedChildren.find((child: Node): boolean =>
      spec.topLevelNodeTypes.has(child.type),
    );
    if (inner === undefined) {
      return node;
    }
    current = inner;
  }
  return current;
}

/** Extracts method units from the body of a class declaration. */
function extractMethods(classNode: Node, spec: LanguageSpec): readonly CodeUnit[] {
  const body: Node | null = classNode.childForFieldName("body");
  const container: Node | undefined =
    body ?? classNode.namedChildren.find((c: Node): boolean => c.type === spec.classBodyNodeType);
  if (container === undefined) {
    return [];
  }
  const methods: CodeUnit[] = [];
  for (const member of container.namedChildren) {
    if (spec.methodNodeTypes.has(member.type)) {
      methods.push(toUnit(member, nameOf(member, spec), "method"));
    }
  }
  return methods;
}

/**
 * Walks the top-level children of the syntax tree, producing one unit per
 * function/class (and one method unit per class method). Anything top-level
 * that is not itself a recognised unit is collected into the module-level
 * bucket, preserving source order by line number.
 */
function collectUnits(tree: Tree, spec: LanguageSpec): readonly CodeUnit[] {
  const units: CodeUnit[] = [];
  const moduleLevelChunks: string[] = [];
  let moduleLevelStart: number | undefined;
  let moduleLevelEnd = 0;

  for (const child of tree.rootNode.namedChildren) {
    const declaration: Node = unwrap(child, spec);
    const unitType: UnitType | undefined = spec.topLevelNodeTypes.get(declaration.type);

    if (unitType === undefined) {
      // Not a unit on its own -> fold into the module-level bucket.
      moduleLevelChunks.push(child.text);
      moduleLevelStart ??= child.startPosition.row + 1;
      moduleLevelEnd = child.endPosition.row + 1;
      continue;
    }

    units.push(toUnit(declaration, nameOf(declaration, spec), unitType));
    if (unitType === "class") {
      units.push(...extractMethods(declaration, spec));
    }
  }

  if (moduleLevelChunks.length > 0 && moduleLevelStart !== undefined) {
    units.push({
      name: MODULE_LEVEL_NAME,
      type: "module-level",
      code: moduleLevelChunks.join("\n"),
      startLine: moduleLevelStart,
      endLine: moduleLevelEnd,
    });
  }

  return units;
}

/**
 * Parses a source file into an ordered list of CodeUnits.
 *
 * @param filePath - Path to a supported source file (`.ts`, `.py`, ...).
 * @throws {ParseError} if the file cannot be read, the language is
 *   unsupported, or the grammar fails to load.
 */
export async function parse(filePath: string): Promise<readonly CodeUnit[]> {
  const spec: LanguageSpec = specForExtension(extname(filePath));

  let source: string;
  try {
    source = await readFile(filePath, "utf8");
  } catch {
    throw new ParseError(`Cannot read file: ${filePath}`);
  }

  await ensureInitialized();
  const language: Language = await loadLanguage(spec);
  const parser: Parser = new Parser();
  parser.setLanguage(language);

  const tree: Tree | null = parser.parse(source);
  if (tree === null) {
    throw new ParseError(`Parser produced no tree for ${filePath}.`);
  }

  try {
    return collectUnits(tree, spec);
  } finally {
    tree.delete();
    parser.delete();
  }
}

export type { CodeUnit, UnitType, SupportedLanguage } from "./types.js";
export { ParseError } from "./types.js";
