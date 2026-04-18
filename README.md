# PromptEnhancer

> 中文版: [README.zh-CN.md](./README.zh-CN.md)

> Turn short, vague "vibe coding" prompts into thorough, high-signal prompts ready for Claude Code, Codex, Cursor, or any other coding agent.

`prompt-enhancer` is a small interactive CLI that takes a one-line idea like *"make me a todo app"*, asks 1–4 targeted clarifying questions via a Claude-Code–style picker in your terminal, then streams back a fully structured prompt (Goal, Context, Functional / Non-functional requirements, Deliverables, Out of scope, Acceptance criteria) you can paste straight into your coding agent.

It also auto-detects project conventions from `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, etc. in your current directory and folds them into the enhanced prompt — so it picks up your stack and house style without asking.

---

## Install / Run

The fastest path is `npx` — no install required:

```bash
export PROMPT_ENHANCER_BASE_URL="https://api.openai.com/v1"
export PROMPT_ENHANCER_AUTH_TOKEN="sk-..."

npx @hcgstudio/prompt-enhancer "make me a todo app"
```

Or install globally:

```bash
npm install -g @hcgstudio/prompt-enhancer
prompt-enhancer "build a CLI that scrapes GitHub stars"
```

### Configuration

| Env var | Required | Description |
|---|---|---|
| `PROMPT_ENHANCER_BASE_URL` | yes | OpenAI-compatible endpoint (OpenAI, Azure, OpenRouter, vLLM, Ollama, etc.) |
| `PROMPT_ENHANCER_AUTH_TOKEN` | yes | API key for that endpoint |
| `PROMPT_ENHANCER_MODEL` | no | Default model (overridden by `-m`). Defaults to `gpt-4o` |

### Flags

- `-m, --model <name>` — override the model for this call
- `--max-tokens <n>` — response cap (default `16000`)

### Modes

```bash
# inline
prompt-enhancer "make me a todo app"

# interactive (prompts you for input)
prompt-enhancer

# pick a different model just for this call
prompt-enhancer -m gpt-4.1 "rewrite this service in Go"
```

---

## Real example

**Your input:**

```bash
$ npx @hcgstudio/prompt-enhancer "make me a todo app"
```

**The CLI asks (interactive picker in your terminal):**

```
? What stack should the todo app use?
❯ Next.js + TypeScript + Tailwind (web)
  Vite + React + TypeScript (web SPA)
  SwiftUI (iOS)
  CLI in Node.js
  Other

? Persistence?
❯ LocalStorage (no backend)
  SQLite via Prisma
  Postgres + Prisma
  Other

? Scope?
❯ MVP — single user, no auth
  Production — multi-user with auth
```

**The CLI streams back the enhanced prompt:**

```markdown
─── Enhanced Prompt ───
You will build a single-user todo web app as an MVP. No backend, no auth.
Persistence is the browser only.

## Goal
Ship a small, polished todo app that a developer can run locally with one command
and deploy to Vercel as a static export. Optimized for first-attempt success by
a coding agent.

## Stack & Constraints
- Next.js 15 (App Router) + TypeScript (strict)
- Tailwind CSS for styling, no component library
- State persisted in `localStorage` under the key `prompt-enhancer.todos.v1`
- Node 20+, npm

## Functional requirements
- Add a todo via an input + Enter key, trimmed, ignore empty strings
- Toggle complete by clicking the row; completed items get a strikethrough
- Delete via a trash icon that appears on row hover
- Filter tabs: All / Active / Completed; counts shown next to each
- "Clear completed" button, disabled when no completed items
- Persist on every mutation; rehydrate on mount with a JSON-schema guard
  (drop malformed entries silently)

## Non-functional requirements
- No layout shift on first paint — render an empty list shell during hydration
- Keyboard-only usable: focus ring visible, Enter adds, Esc clears the input
- All interactive elements have aria-labels
- Lighthouse a11y ≥ 95 on the default page

## Deliverables
- `app/page.tsx`, `app/layout.tsx`, `app/globals.css`
- `lib/storage.ts` — typed load/save helpers with the schema guard
- `components/TodoList.tsx`, `components/TodoItem.tsx`, `components/Filters.tsx`
- `README.md` with `npm install && npm run dev` instructions
- One Playwright test covering: add → toggle → filter → reload persistence

## Out of scope
- Authentication, multi-user, sync across devices
- Drag-and-drop reordering
- Dark mode toggle (use `prefers-color-scheme` only)
- Any backend or database

## Acceptance criteria
- `npm run dev` boots without warnings and the page loads at `/`
- All functional requirements pass manual smoke test
- The Playwright test passes in CI
- Reloading the page preserves todos and their completed state
───────────────────────
```

You then paste that into Claude Code / Codex / Cursor and let it build.

---

## How it works

1. The CLI sends your rough prompt to the configured chat-completions endpoint with a system prompt that tells the model to act as a prompt enhancer.
2. The model is given two tools:
   - `read_ai_instructions` — reads `CLAUDE.md` / `AGENTS.md` / `.cursorrules` / etc. from the current working directory so project conventions are folded into the output.
   - `ask_question` — opens an interactive picker in your terminal for the most load-bearing clarifications. The model is instructed to ask at most 1–4 questions.
3. After clarifications, the model streams the final enhanced prompt to stdout in Markdown.

The whole loop runs in your terminal — no data goes anywhere except your configured LLM endpoint.

---

## Development

```bash
git clone https://github.com/hcgstudio/prompt-enhancer
cd prompt-enhancer
npm install
npm run dev -- "your test prompt"   # runs from src via tsx
npm run build                        # compiles to dist/
```

## Publishing

Tagged releases are published to npm via GitHub Actions (`.github/workflows/publish.yml`). Bump and tag:

```bash
npm version patch && git push --follow-tags
```

## License

[MIT](./LICENSE) © HCGStudio
