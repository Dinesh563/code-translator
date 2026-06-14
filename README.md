# explain-cli

Translate source code into plain-English explanations, with caching.

Parses a TypeScript or Python file into its functions, methods, and classes,
asks Claude to explain each one in a short paragraph, caches the results, and
writes a readable `.explained.md` alongside the source.

## Install

```bash
npm install          # installs deps, builds better-sqlite3, copies grammars
npm run build
npm link             # exposes `explain` globally
```

Set your API key (either in the environment or a `.env` file):

```bash
cp .env.example .env
# edit .env to add: ANTHROPIC_API_KEY=sk-ant-...
```

## Usage

```bash
explain ./src/server.ts                 # writes ./src/server.ts.explained.md
explain ./app.py --output docs/app.md   # custom output path
explain ./src/server.ts --force         # ignore cache, re-translate everything
explain ./src/server.ts --model claude-sonnet-4-6
```

During development, run from source without building:

```bash
npm run dev -- ./test.ts
```

## How it works

1. **Parse** — tree-sitter (WASM grammars) splits the file into code units:
   functions, methods, classes, plus a `module-level` bucket for top-level
   imports and constants.
2. **Cache** — each unit is keyed by a SHA-256 of its *normalized* source, so
   cosmetic edits (trailing whitespace) don't bust the cache. Stored in SQLite
   at `~/.cache/explain-cli/cache.db`.
3. **Translate** — uncached units go to the Anthropic API (default model
   `claude-haiku-4-5-20251001`); results are written back to the cache as they
   return. Transient API errors are retried with backoff.
4. **Render** — assembles a markdown document: one section per unit with a
   heading, the original code in a fenced block, and its explanation.

On a re-run with no source changes, every unit is served from cache and no API
calls are made.

## Options

| Flag | Description |
| --- | --- |
| `-o, --output <path>` | Output path (default: `<file>.explained.md`). |
| `-m, --model <name>` | Anthropic model to use (default: Haiku). |
| `-f, --force` | Bypass the cache and re-translate every unit. |
| `-v, --version` | Print version. |
| `-h, --help` | Show help. |

Supported source extensions: `.ts`, `.tsx`, `.mts`, `.cts`, `.py`, `.pyi`.

## Requirements

- Node.js ≥ 18
- An `ANTHROPIC_API_KEY`

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Run from source with `tsx`. |
| `npm run build` | Bundle to `dist/` (`better-sqlite3` left external). |
| `npm run grammars` | Copy grammar `.wasm` files into `grammars/`. |
| `npm run typecheck` | `tsc --noEmit`. |
