import type { CodeUnit } from "../parser/index.js";

/**
 * System prompt: constrains the model to concise, plain-English explanations
 * with no code echoed back — exactly one short paragraph per unit.
 */
export const SYSTEM_PROMPT: string =
  "You explain source code to developers in plain English. " +
  "For the code unit provided, write exactly one short paragraph (2-4 sentences) " +
  "describing what it does and why it exists. " +
  "Do not echo or quote the code. Do not use markdown, headings, bullet points, " +
  "or code fences. Focus on intent and behavior, not a line-by-line restatement. " +
  "Respond with the explanation only — no preamble such as 'This function...'.";

/** Builds the user-message content describing a single unit to explain. */
export function buildUserPrompt(unit: CodeUnit): string {
  return (
    `Explain this ${unit.type} named "${unit.name}".\n\n` +
    "```\n" +
    unit.code +
    "\n```"
  );
}
