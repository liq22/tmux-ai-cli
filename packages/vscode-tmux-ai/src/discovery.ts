import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";

import { readConfig, updateCliPath } from "./config";

function expandPathTemplate(p: string): string {
  const home = os.homedir();
  if (p.startsWith("~" + path.sep) || p === "~") {
    return path.join(home, p.slice(1));
  }
  return p.replaceAll("$HOME", home);
}

async function isExecutableFile(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return false;
    await fs.access(filePath, 0o111);
    return true;
  } catch {
    return false;
  }
}

export async function ensureCliPath(interactive: boolean): Promise<string | null> {
  const cfg = readConfig();
  if (cfg.cliPath) return cfg.cliPath;

  const candidates = cfg.discoverySearchPaths.map(expandPathTemplate);
  for (const candidate of candidates) {
    if (!(await isExecutableFile(candidate))) continue;
    if (!interactive) return candidate;

    const action = await vscode.window.showInformationMessage(
      `发现 tmux-ai-cli: ${candidate}`,
      "Use",
      "Cancel",
    );
    if (action === "Use") {
      await updateCliPath(candidate);
      return candidate;
    }
    return null;
  }

  if (interactive) {
    const action = await vscode.window.showErrorMessage(
      "未找到 tmux-ai-cli (ai)。请在设置中配置 tmuxAi.cliPath。",
      "Open Settings",
      "Select File",
    );
    if (action === "Open Settings") {
      await vscode.commands.executeCommand("workbench.action.openSettings", "tmuxAi.cliPath");
    }
    if (action === "Select File") {
      const picked = await pickCliPath();
      return picked;
    }
  }

  return null;
}

export async function pickCliPath(): Promise<string | null> {
  const uris = await vscode.window.showOpenDialog({
    canSelectMany: false,
    canSelectFiles: true,
    canSelectFolders: false,
    title: "Select tmux-ai-cli executable (ai)",
  });
  if (!uris || uris.length === 0) return null;

  const fsPath = uris[0].fsPath;
  await updateCliPath(fsPath);
  return fsPath;
}

