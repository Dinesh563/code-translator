#!/usr/bin/env node
// Copies the prebuilt grammar .wasm files out of node_modules into a stable
// grammars/ directory, so runtime paths don't depend on node_modules layout.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "grammars");
mkdirSync(outDir, { recursive: true });

/** @type {ReadonlyArray<readonly [string, string]>} */
const grammars = [
  ["tree-sitter-typescript/tree-sitter-typescript.wasm", "tree-sitter-typescript.wasm"],
  ["tree-sitter-python/tree-sitter-python.wasm", "tree-sitter-python.wasm"],
];

for (const [from, to] of grammars) {
  const src = resolve(root, "node_modules", from);
  const dest = resolve(outDir, to);
  try {
    copyFileSync(src, dest);
    console.log(`copied ${to}`);
  } catch (error) {
    console.error(`Failed to copy ${from}: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}
