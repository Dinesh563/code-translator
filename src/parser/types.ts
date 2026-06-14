/**
 * The kind of code construct a {@link CodeUnit} represents.
 * `module-level` is the synthetic bucket for top-level code that is not
 * itself a function, method, or class (imports, constants, side effects).
 */
export type UnitType = "function" | "method" | "class" | "module-level";

/**
 * A single named, explainable region of a source file.
 * Line numbers are 1-based and inclusive, matching editor conventions.
 */
export interface CodeUnit {
  /** Display name, e.g. a function or class identifier, or `"module-level"`. */
  readonly name: string;
  /** What kind of construct this unit is. */
  readonly type: UnitType;
  /** The exact source text of the unit. */
  readonly code: string;
  /** 1-based inclusive start line. */
  readonly startLine: number;
  /** 1-based inclusive end line. */
  readonly endLine: number;
}

/** Languages this parser can handle. */
export type SupportedLanguage = "typescript" | "python";

/** Raised when a file cannot be parsed or its language is unsupported. */
export class ParseError extends Error {
  public override readonly name = "ParseError";

  public constructor(message: string) {
    super(message);
  }
}
