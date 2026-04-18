import { spawn } from "node:child_process";
import { select } from "@inquirer/prompts";
import chalk from "chalk";

export type LaunchTarget = "claude" | "codex";
type Target = LaunchTarget | "skip";

const TARGETS: Record<LaunchTarget, { bin: string; label: string }> = {
  claude: { bin: "claude", label: "Claude Code" },
  codex: { bin: "codex", label: "Codex" },
};

export async function maybeDispatch(
  prompt: string,
  preset?: LaunchTarget
): Promise<void> {
  let target: Target;
  if (preset) {
    target = preset;
  } else {
    if (!process.stdout.isTTY || !process.stdin.isTTY) return;
    target = (await select({
      message: chalk.bold("Send enhanced prompt to a coding agent?"),
      choices: [
        { name: "Claude Code (claude)", value: "claude", short: "Claude Code" },
        { name: "Codex (codex)", value: "codex", short: "Codex" },
        { name: chalk.italic("Skip — just print"), value: "skip", short: "Skip" },
      ],
    })) as Target;
  }

  if (target === "skip") return;

  const { bin, label } = TARGETS[target];
  console.log(chalk.whiteBright(`\n→ Launching ${label} (${bin})…\n`));

  await new Promise<void>((resolvePromise) => {
    const child = spawn(bin, [prompt], { stdio: "inherit" });
    child.on("error", (err) => {
      const msg = (err as NodeJS.ErrnoException).code === "ENOENT"
        ? `'${bin}' not found on PATH. Install it and try again.`
        : err.message;
      console.error(chalk.redBright(`Failed to launch ${label}: ${msg}`));
      resolvePromise();
    });
    child.on("exit", () => resolvePromise());
  });
}
