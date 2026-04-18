#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import { input } from "@inquirer/prompts";
import { enhance } from "./enhancer.js";

const program = new Command();

program
  .name("prompt-enhancer")
  .description("Enhance a vibe coding prompt into a high-quality prompt for Claude Code / GPT.")
  .argument("[prompt...]", "Your rough prompt. If omitted, you'll be prompted interactively.")
  .option("-m, --model <model>", "Model name", process.env.PROMPT_ENHANCER_MODEL || "gpt-4o")
  .option("--max-tokens <n>", "Max tokens for response", (v) => parseInt(v, 10), 16000)
  .action(async (promptArgs: string[], opts: { model: string; maxTokens: number }) => {
    const baseURL = process.env.PROMPT_ENHANCER_BASE_URL;
    const apiKey = process.env.PROMPT_ENHANCER_AUTH_TOKEN;

    if (!baseURL || !apiKey) {
      console.error(
        chalk.redBright(
          "Missing env vars. Please set PROMPT_ENHANCER_BASE_URL and PROMPT_ENHANCER_AUTH_TOKEN."
        )
      );
      process.exit(1);
    }

    let userPrompt = promptArgs.join(" ").trim();
    if (!userPrompt) {
      userPrompt = (
        await input({ message: "Enter your rough prompt:", validate: (v) => v.trim().length > 0 || "Prompt cannot be empty" })
      ).trim();
    }

    console.log(chalk.whiteBright(`\nUsing model: ${opts.model}  •  max_tokens: ${opts.maxTokens}\n`));

    try {
      await enhance({
        baseURL,
        apiKey,
        model: opts.model,
        maxTokens: opts.maxTokens,
        userPrompt,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.redBright("Error: " + msg));
      process.exit(1);
    }
  });

program.parseAsync(process.argv);
