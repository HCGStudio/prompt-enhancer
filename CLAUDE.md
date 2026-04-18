# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev -- "your prompt"` — run the CLI from `src/` via `tsx` (no build step)
- `npm run build` — compile TypeScript to `dist/` and chmod the bin entry
- `npm start -- "..."` — same as `dev`

There is no test suite or linter configured. Manual smoke test by running `npm run dev -- "make me a todo app"` against an OpenAI-compatible endpoint.

Required env vars when running: `PROMPT_ENHANCER_BASE_URL`, `PROMPT_ENHANCER_AUTH_TOKEN`. Optional: `PROMPT_ENHANCER_MODEL` (default `gpt-4o`).

## Architecture

Single-process CLI (`bin: prompt-enhancer`) that wraps an OpenAI-compatible chat-completions endpoint with a tool-calling loop. ESM-only (`"type": "module"`); imports use `.js` extensions even from `.ts` sources because `tsc` emits ESM and Node resolves the emitted paths.

Three files, in dependency order:

1. **`src/index.ts`** — Commander CLI entry. Parses argv, prompts for input via `@inquirer/prompts` if no prompt given, validates env vars, and hands off to `enhance()`.

2. **`src/enhancer.ts`** — Core loop. Holds the system prompt that defines PromptEnhancer's behavior (clarify-then-enhance, output structure: Goal / Context / Functional / Non-functional / Deliverables / Out of scope / Acceptance). Streams chat completions with `tool_choice: "auto"` and two tools registered. The loop (max 12 turns):
   - Accumulates streamed `delta.tool_calls` by index (id/name/arguments arrive in fragments).
   - Streams `delta.content` directly to stdout under an "─── Enhanced Prompt ───" header once content begins.
   - On a turn with no tool calls, prints the closing rule and returns the final content.
   - On tool calls, dispatches each to its handler and pushes a `role: "tool"` message keyed by `tool_call_id`.

3. **`src/tools.ts`** — Two tools the model can call:
   - `ask_question` — renders `select`/`checkbox` via `@inquirer/prompts`, always appending an "Other (type custom answer)" choice. Returns the chosen label(s) as a plain string back to the model. Designed to look like Claude Code's question UI.
   - `read_ai_instructions` — reads project convention files from `process.cwd()` (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`, `.github/copilot-instructions.md`, etc., plus any `extra_paths`). Rejects paths that escape cwd. Truncates each file at 64 KiB. Called once at the start of each enhance run so the model can fold project conventions into the output and skip questions they already answer.

The system prompt is the contract: changes to clarification behavior, output sections, or language-matching live there, not in code.

## Publishing

`npm version patch && git push --follow-tags` triggers `.github/workflows/publish.yml`, which runs `npm run build` then `npm publish` with `NPM_TOKEN`. `prepublishOnly` also runs `build` as a safety net. Only `dist/` is shipped (see `files` in `package.json`).
