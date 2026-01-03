import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as vscode from "vscode";

import { ensureCliPath, pickCliPath } from "./discovery";

const execFileAsync = promisify(execFile);

async function runListJson(cliPath: string): Promise<unknown> {
  const { stdout } = await execFileAsync(cliPath, ["list", "--json"], {
    timeout: 10_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("tmuxAi.selectCliPath", async () => {
      await pickCliPath();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("tmuxAi.refresh", async () => {
      try {
        const cliPath = await ensureCliPath(true);
        if (!cliPath) return;
        const obj = await runListJson(cliPath);
        const sessions = (obj as any)?.sessions?.length ?? 0;
        vscode.window.showInformationMessage(`Tmux AI: ${sessions} session(s)`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Tmux AI refresh failed: ${message}`);
      }
    }),
  );

  void ensureCliPath(false);
}

export function deactivate(): void {}

