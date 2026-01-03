import * as vscode from "vscode";

import { readConfig } from "./config";
import { CliRunner } from "./cli/runner";
import { ensureCliPath, pickCliPath } from "./discovery";

let cachedRunner: { cliPath: string; runner: CliRunner } | null = null;

function getRunner(cliPath: string): CliRunner {
  const cfg = readConfig();
  if (cachedRunner?.cliPath === cliPath) return cachedRunner.runner;
  cachedRunner = { cliPath, runner: new CliRunner({ cliPath, debug: cfg.debug }) };
  return cachedRunner.runner;
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
        const runner = getRunner(cliPath);
        const resp = await runner.list();
        vscode.window.showInformationMessage(`Tmux AI: ${resp.sessions.length} session(s)`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Tmux AI refresh failed: ${message}`);
      }
    }),
  );

  void ensureCliPath(false);
}

export function deactivate(): void {}
