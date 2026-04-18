#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import { input, password, select } from "@inquirer/prompts";
import OpenAI from "openai";
import { enhance } from "./enhancer.js";
import { maybeDispatch } from "./dispatch.js";
import { loadConfig, saveConfig, getConfigPath, type Config } from "./config.js";

const program = new Command();

program
  .name("prompt-enhancer")
  .description("Enhance a vibe coding prompt into a high-quality prompt for Claude Code / GPT.")
  .argument("[prompt...]", "Your rough prompt. If omitted, you'll be prompted interactively.")
  .option("-m, --model <model>", "Model name (overrides env / config)")
  .option("--max-tokens <n>", "Max tokens for response", (v) => parseInt(v, 10), 16000)
  .action(async (promptArgs: string[], opts: { model?: string; maxTokens: number }) => {
    const fileCfg = await loadConfig();
    const resolved: Config = {
      baseURL: process.env.PROMPT_ENHANCER_BASE_URL || fileCfg.baseURL,
      apiKey: process.env.PROMPT_ENHANCER_AUTH_TOKEN || fileCfg.apiKey,
      model: opts.model || process.env.PROMPT_ENHANCER_MODEL || fileCfg.model,
    };

    const updates: Config = {};

    if (!resolved.baseURL) {
      resolved.baseURL = (
        await input({
          message: "API base URL (e.g. https://api.openai.com/v1):",
          validate: (v) => v.trim().length > 0 || "base URL cannot be empty",
        })
      ).trim();
      updates.baseURL = resolved.baseURL;
    }

    if (!resolved.apiKey) {
      resolved.apiKey = (
        await password({
          message: "API auth token:",
          validate: (v) => v.trim().length > 0 || "token cannot be empty",
        })
      ).trim();
      updates.apiKey = resolved.apiKey;
    }

    if (!resolved.model) {
      resolved.model = await pickModel(resolved.baseURL!, resolved.apiKey!);
      updates.model = resolved.model;
    }

    if (Object.keys(updates).length > 0) {
      const merged: Config = { ...fileCfg, ...updates };
      try {
        await saveConfig(merged);
        console.log(chalk.whiteBright(`✓ Saved config to ${getConfigPath()}`));
      } catch (err) {
        console.error(
          chalk.yellowBright(
            `⚠ Failed to save config: ${err instanceof Error ? err.message : String(err)}`
          )
        );
      }
    }

    let userPrompt = promptArgs.join(" ").trim();
    if (!userPrompt) {
      userPrompt = (
        await input({
          message: "Enter your rough prompt:",
          validate: (v) => v.trim().length > 0 || "Prompt cannot be empty",
        })
      ).trim();
    }

    console.log(
      chalk.whiteBright(`\nUsing model: ${resolved.model}  •  max_tokens: ${opts.maxTokens}\n`)
    );

    let enhanced: string;
    try {
      enhanced = await enhance({
        baseURL: resolved.baseURL!,
        apiKey: resolved.apiKey!,
        model: resolved.model!,
        maxTokens: opts.maxTokens,
        userPrompt,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.redBright("Error: " + msg));
      process.exit(1);
    }

    if (enhanced.trim()) {
      try {
        await maybeDispatch(enhanced);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.redBright("Dispatch error: " + msg));
      }
    }
  });

async function pickModel(baseURL: string, apiKey: string): Promise<string> {
  const client = new OpenAI({ baseURL, apiKey });
  let ids: string[] = [];
  try {
    const list = await client.models.list();
    ids = list.data.map((m) => m.id).sort();
  } catch (err) {
    console.error(
      chalk.yellowBright(
        `⚠ Could not fetch models from ${baseURL}: ${
          err instanceof Error ? err.message : String(err)
        }`
      )
    );
  }

  if (ids.length === 0) {
    return (
      await input({
        message: "Model name:",
        validate: (v) => v.trim().length > 0 || "model cannot be empty",
      })
    ).trim();
  }

  return await select({
    message: "Select model:",
    choices: ids.map((id) => ({ name: id, value: id })),
    pageSize: 15,
  });
}

program.parseAsync(process.argv);
