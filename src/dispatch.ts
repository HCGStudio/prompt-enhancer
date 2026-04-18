import { spawn } from "node:child_process";
import { select, input } from "@inquirer/prompts";
import chalk from "chalk";

export type LaunchTarget = "claude" | "codex";
type Action = LaunchTarget | "amend" | "skip";

const TARGETS: Record<LaunchTarget, { bin: string; label: string }> = {
  claude: { bin: "claude", label: "Claude Code" },
  codex: { bin: "codex", label: "Codex" },
};

export interface DispatchOptions {
  preset?: LaunchTarget;
  refine?: (feedback: string) => Promise<string>;
}

export async function maybeDispatch(prompt: string, opts: DispatchOptions = {}): Promise<void> {
  let current = prompt;

  while (true) {
    let action: Action;
    if (opts.preset) {
      action = opts.preset;
    } else {
      if (!process.stdout.isTTY || !process.stdin.isTTY) return;
      const choices = [
        { name: "Claude Code (claude)", value: "claude" as const, short: "Claude Code" },
        { name: "Codex (codex)", value: "codex" as const, short: "Codex" },
        ...(opts.refine
          ? [{ name: "Amend / refine prompt", value: "amend" as const, short: "Amend" }]
          : []),
        { name: chalk.italic("Skip — just print"), value: "skip" as const, short: "Skip" },
      ];
      action = (await select({
        message: chalk.bold("Send enhanced prompt to a coding agent?"),
        choices,
      })) as Action;
    }

    if (action === "skip") return;

    if (action === "amend") {
      if (!opts.refine) return;
      const feedback = (
        await input({
          message: "What should change?",
          validate: (v) => v.trim().length > 0 || "Feedback cannot be empty",
        })
      ).trim();
      current = await opts.refine(feedback);
      continue;
    }

    const { bin, label } = TARGETS[action];
    console.log(chalk.whiteBright(`\n→ Launching ${label} (${bin})…\n`));

    await new Promise<void>((resolvePromise) => {
      const child = spawn(bin, [current], { stdio: "inherit" });
      child.on("error", (err) => {
        const msg = (err as NodeJS.ErrnoException).code === "ENOENT"
          ? `'${bin}' not found on PATH. Install it and try again.`
          : err.message;
        console.error(chalk.redBright(`Failed to launch ${label}: ${msg}`));
        resolvePromise();
      });
      child.on("exit", () => resolvePromise());
    });
    return;
  }
}
