import { select, checkbox, input } from "@inquirer/prompts";
import chalk from "chalk";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { ChatCompletionTool } from "openai/resources/chat/completions";

export const askQuestionTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "ask_question",
    description:
      "Ask the user a clarifying question to better understand their requirements before producing the final enhanced prompt. Use this aggressively when the user's request is ambiguous (e.g. unclear tech stack, scope, target platform, styling preferences, data shape, deployment target). Prefer this over guessing. Each call surfaces an interactive selection UI in the user's terminal.",
    parameters: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "A clear, specific question (ends with '?').",
        },
        header: {
          type: "string",
          description: "Short label / category (max ~12 chars), e.g. 'Framework', 'Scope'.",
        },
        options: {
          type: "array",
          minItems: 2,
          maxItems: 6,
          description:
            "2-6 distinct, mutually exclusive choices. The user can also pick 'Other' to type a custom answer.",
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: "Short choice label (1-5 words)." },
              description: { type: "string", description: "One-line explanation of the choice." },
            },
            required: ["label"],
          },
        },
        multi_select: {
          type: "boolean",
          description: "Allow multiple selections. Default false.",
        },
      },
      required: ["question", "header", "options"],
    },
  },
};

export interface AskQuestionArgs {
  question: string;
  header: string;
  options: { label: string; description?: string }[];
  multi_select?: boolean;
}

const OTHER = "__OTHER__";

export async function runAskQuestion(args: AskQuestionArgs): Promise<string> {
  const { question, header, options, multi_select } = args;

  console.log();
  console.log(chalk.cyanBright.bold(`? ${question}`) + chalk.whiteBright(`  [${header}]`));

  const choices = [
    ...options.map((o, i) => ({
      name: o.description ? `${o.label} ${chalk.whiteBright("— " + o.description)}` : o.label,
      value: String(i),
      short: o.label,
    })),
    { name: chalk.italic("Other (type custom answer)"), value: OTHER, short: "Other" },
  ];

  if (multi_select) {
    const picked = (await checkbox({
      message: chalk.bold("Select one or more:"),
      choices,
      pageSize: 10,
    })) as string[];

    const labels: string[] = [];
    for (const v of picked) {
      if (v === OTHER) {
        const custom = await input({ message: "Your custom answer:" });
        if (custom.trim()) labels.push(custom.trim());
      } else {
        labels.push(options[Number(v)].label);
      }
    }
    const answer = labels.join(", ") || "(no selection)";
    console.log(chalk.greenBright("→ " + answer));
    return answer;
  }

  const picked = (await select({
    message: chalk.bold("Choose one:"),
    choices,
    pageSize: 10,
  })) as string;

  let answer: string;
  if (picked === OTHER) {
    answer = (await input({ message: "Your custom answer:" })).trim() || "(no answer)";
  } else {
    answer = options[Number(picked)].label;
  }
  console.log(chalk.greenBright("→ " + answer));
  return answer;
}

const AI_INSTRUCTION_FILES = [
  "CLAUDE.md",
  "CLAUDE.local.md",
  "AGENTS.md",
  "AGENT.md",
  ".cursorrules",
  ".cursor/rules",
  ".windsurfrules",
  ".github/copilot-instructions.md",
  ".aider.conf.yml",
  "GEMINI.md",
  "CONVENTIONS.md",
];

const MAX_FILE_BYTES = 64 * 1024;

export const readAiInstructionsTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "read_ai_instructions",
    description:
      "Read AI assistant instruction files from the user's current working directory (e.g. CLAUDE.md, AGENTS.md, .cursorrules, .github/copilot-instructions.md). Use this BEFORE asking clarifying questions to discover existing project conventions, tech stack, style rules, and constraints — these should be reflected in the enhanced prompt and may answer questions you'd otherwise need to ask. Returns the contents of any found files; returns a 'no files found' message if none exist.",
    parameters: {
      type: "object",
      properties: {
        extra_paths: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional additional relative file paths to read (e.g. 'docs/STYLE.md'). Resolved against the current working directory. Path traversal outside cwd is rejected.",
        },
      },
    },
  },
};

export interface ReadAiInstructionsArgs {
  extra_paths?: string[];
}

export async function runReadAiInstructions(args: ReadAiInstructionsArgs): Promise<string> {
  const cwd = process.cwd();
  const candidates = new Set<string>(AI_INSTRUCTION_FILES);
  for (const p of args.extra_paths ?? []) {
    if (typeof p === "string" && p.trim()) candidates.add(p.trim());
  }

  const sections: string[] = [];
  const found: string[] = [];

  for (const rel of candidates) {
    const abs = resolve(cwd, rel);
    if (!abs.startsWith(cwd + "/") && abs !== cwd) continue;

    let st;
    try {
      st = await stat(abs);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;

    let body: string;
    try {
      const buf = await readFile(abs);
      const truncated = buf.length > MAX_FILE_BYTES;
      body = buf.subarray(0, MAX_FILE_BYTES).toString("utf8");
      if (truncated) body += `\n\n[... truncated, file is ${buf.length} bytes ...]`;
    } catch (err) {
      sections.push(`### ${rel}\n[ERROR reading file: ${(err as Error).message}]`);
      continue;
    }
    found.push(rel);
    sections.push(`### ${rel}\n${body}`);
  }

  console.log();
  if (found.length === 0) {
    console.log(chalk.whiteBright(`📄 No AI instruction files found in ${cwd}`));
    return `No AI instruction files found in ${cwd}. Checked: ${[...candidates].join(", ")}`;
  }
  console.log(chalk.whiteBright(`📄 Read AI instructions: ${found.join(", ")}`));
  return `Found ${found.length} file(s) in ${cwd}:\n\n${sections.join("\n\n")}`;
}
