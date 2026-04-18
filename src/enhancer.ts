import OpenAI, { APIError } from "openai";
import type { ResponseInputItem } from "openai/resources/responses/responses";
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import type { FunctionTool } from "openai/resources/responses/responses";
import chalk from "chalk";
import ora from "ora";
import {
  askQuestionTool,
  runAskQuestion,
  type AskQuestionArgs,
  readAiInstructionsTool,
  runReadAiInstructions,
  type ReadAiInstructionsArgs,
} from "./tools.js";

const SYSTEM_PROMPT = `You are PromptEnhancer — an expert at transforming short, vague "vibe coding" prompts into thorough, high-signal prompts ready to feed into coding agents like Claude Code or GPT.

Your output prompt should be designed to make the downstream coding agent succeed on the FIRST attempt. A great enhanced prompt typically includes:

1. **Goal** — one-paragraph statement of what the user actually wants built / changed.
2. **Context & Constraints** — language, framework, runtime, existing codebase assumptions, style conventions.
3. **Functional requirements** — concrete, testable bullet points. Cover edge cases.
4. **Non-functional requirements** — performance, accessibility, security, error handling, observability where relevant.
5. **Deliverables** — file layout, commands to run, what "done" looks like.
6. **Out of scope** — what NOT to do, to prevent the agent from over-building.
7. **Acceptance criteria** — how the user will verify success.

CLARIFY BEFORE ENHANCING:
- The user's initial prompt is almost always under-specified.
- FIRST, call \`read_ai_instructions\` once to load any project conventions from CLAUDE.md / AGENTS.md / .cursorrules / etc. in the user's working directory. These often answer questions about stack, style, and constraints — incorporate them into the enhanced prompt and skip questions they already resolve.
- Then use the \`ask_question\` tool to resolve the most load-bearing remaining ambiguities BEFORE writing the final enhanced prompt.
- Ask 1-4 targeted questions total. Do not interrogate the user. Pick the questions whose answers most change the final prompt.
- Good clarifying topics: target stack/framework, scope size (MVP vs production), target platform, existing-codebase vs greenfield, styling/UI library, data persistence, auth, deployment target.
- Skip questions whose answers you can confidently infer from the user's wording.
- Each \`ask_question\` call shows an interactive picker in the user's terminal — provide concrete options.

OUTPUT FORMAT:
- After clarifications, your final assistant message must contain ONLY the enhanced prompt (Markdown), no preamble, no meta commentary, no "Here is the enhanced prompt:" prefix.
- Write the enhanced prompt in the same language the user used (Chinese stays Chinese, English stays English).
- Address it directly to the coding agent in the second person ("You will build…").
- Be specific and concrete. Prefer bullet lists over prose. Avoid filler.`;

export interface EnhanceOptions {
  baseURL: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  userPrompt: string;
}

export async function enhance(opts: EnhanceOptions): Promise<string> {
  const client = new OpenAI({ baseURL: opts.baseURL, apiKey: opts.apiKey });

  try {
    return await enhanceWithResponses(client, opts);
  } catch (err) {
    if (!shouldFallback(err)) throw err;
    const reason = err instanceof Error ? err.message : String(err);
    console.error(
      chalk.yellowBright(
        `\n⚠ Responses API unavailable (${reason.split("\n")[0]}). Falling back to Chat Completions.\n`
      )
    );
    return await enhanceWithChatCompletions(client, opts);
  }
}

function shouldFallback(err: unknown): boolean {
  return err instanceof APIError;
}

async function enhanceWithResponses(
  client: OpenAI,
  opts: EnhanceOptions
): Promise<string> {
  const input: ResponseInputItem[] = [
    { role: "user", content: opts.userPrompt },
  ];
  let firstCall = true;

  for (let turn = 0; turn < 12; turn++) {
    const spinner = ora({ text: chalk.whiteBright("Thinking…"), color: "cyan" }).start();
    let textContent = "";
    const functionCalls: { call_id: string; name: string; arguments: string }[] = [];
    let headerPrinted = false;

    try {
      let stream;
      try {
        stream = await client.responses.create({
          model: opts.model,
          max_output_tokens: opts.maxTokens,
          instructions: SYSTEM_PROMPT,
          input,
          tools: [askQuestionTool, readAiInstructionsTool],
          tool_choice: "auto",
          stream: true,
        });
      } catch (err) {
        if (firstCall) throw err;
        spinner.stop();
        throw err;
      }
      firstCall = false;

      for await (const event of stream) {
        if (event.type === "response.output_text.delta") {
          if (!headerPrinted) {
            spinner.stop();
            process.stdout.write("\n" + chalk.cyanBright.bold("─── Enhanced Prompt ───") + "\n");
            headerPrinted = true;
          }
          process.stdout.write(event.delta);
          textContent += event.delta;
        } else if (event.type === "response.output_item.done") {
          const item = event.item;
          if (item.type === "function_call") {
            functionCalls.push({
              call_id: item.call_id,
              name: item.name,
              arguments: item.arguments,
            });
            input.push(item);
          } else if (item.type === "message" || item.type === "reasoning") {
            input.push(item as ResponseInputItem);
          }
        }
      }
    } finally {
      spinner.stop();
    }

    if (functionCalls.length === 0) {
      if (headerPrinted) {
        process.stdout.write("\n" + chalk.cyanBright.bold("───────────────────────") + "\n\n");
      }
      return textContent.trim();
    }

    for (const call of functionCalls) {
      const output = await runToolCall(call.name, call.arguments);
      input.push({
        type: "function_call_output",
        call_id: call.call_id,
        output,
      });
    }
  }

  throw new Error("Exceeded max conversation turns without a final response.");
}

function toChatTool(t: FunctionTool): ChatCompletionTool {
  return {
    type: "function",
    function: {
      name: t.name,
      description: t.description ?? undefined,
      parameters: (t.parameters ?? {}) as Record<string, unknown>,
    },
  };
}
const chatAskQuestionTool = toChatTool(askQuestionTool as FunctionTool);
const chatReadAiInstructionsTool = toChatTool(readAiInstructionsTool as FunctionTool);

async function enhanceWithChatCompletions(
  client: OpenAI,
  opts: EnhanceOptions
): Promise<string> {
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: opts.userPrompt },
  ];

  for (let turn = 0; turn < 12; turn++) {
    const spinner = ora({ text: chalk.whiteBright("Thinking…"), color: "cyan" }).start();
    let content = "";
    const toolCallsAcc: Record<number, { id: string; name: string; arguments: string }> = {};
    let headerPrinted = false;

    try {
      const stream = await client.chat.completions.create({
        model: opts.model,
        max_tokens: opts.maxTokens,
        messages,
        tools: [chatAskQuestionTool, chatReadAiInstructionsTool],
        tool_choice: "auto",
        stream: true,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index;
            if (!toolCallsAcc[idx]) {
              toolCallsAcc[idx] = { id: tc.id ?? "", name: "", arguments: "" };
            }
            if (tc.id) toolCallsAcc[idx].id = tc.id;
            if (tc.function?.name) toolCallsAcc[idx].name += tc.function.name;
            if (tc.function?.arguments) toolCallsAcc[idx].arguments += tc.function.arguments;
          }
        }

        if (delta.content) {
          if (!headerPrinted) {
            spinner.stop();
            process.stdout.write("\n" + chalk.cyanBright.bold("─── Enhanced Prompt ───") + "\n");
            headerPrinted = true;
          }
          process.stdout.write(delta.content);
          content += delta.content;
        }
      }
    } finally {
      spinner.stop();
    }

    const toolCallList = Object.keys(toolCallsAcc)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => toolCallsAcc[Number(k)]);

    const toolCalls: ChatCompletionMessageToolCall[] = toolCallList.map((c) => ({
      id: c.id,
      type: "function",
      function: { name: c.name, arguments: c.arguments },
    }));

    messages.push({
      role: "assistant",
      content: content || null,
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    } as ChatCompletionMessageParam);

    if (toolCalls.length === 0) {
      if (headerPrinted) {
        process.stdout.write("\n" + chalk.cyanBright.bold("───────────────────────") + "\n\n");
      }
      return content.trim();
    }

    for (const call of toolCalls) {
      if (call.type !== "function") continue;
      const output = await runToolCall(call.function.name, call.function.arguments);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: output,
      });
    }
  }

  throw new Error("Exceeded max conversation turns without a final response.");
}

async function runToolCall(name: string, rawArgs: string): Promise<string> {
  if (name === "ask_question") {
    let parsed: AskQuestionArgs;
    try {
      parsed = JSON.parse(rawArgs);
    } catch {
      return "ERROR: invalid JSON arguments";
    }
    return await runAskQuestion(parsed);
  }
  if (name === "read_ai_instructions") {
    let parsed: ReadAiInstructionsArgs = {};
    if (rawArgs?.trim()) {
      try {
        parsed = JSON.parse(rawArgs);
      } catch {
        return "ERROR: invalid JSON arguments";
      }
    }
    return await runReadAiInstructions(parsed);
  }
  return `ERROR: unknown tool ${name}`;
}
