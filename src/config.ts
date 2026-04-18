import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface Config {
  baseURL?: string;
  apiKey?: string;
  model?: string;
}

export function getConfigPath(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.trim() ? xdg : join(homedir(), ".config");
  return join(base, "prompt-enhancer", "config.json");
}

export async function loadConfig(): Promise<Config> {
  try {
    const raw = await readFile(getConfigPath(), "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as Config;
  } catch {
    // missing or unreadable -> empty config
  }
  return {};
}

export async function saveConfig(cfg: Config): Promise<void> {
  const path = getConfigPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 });
}
