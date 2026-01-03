import * as vscode from "vscode";

import { readConfig } from "./config";
import { getCliRunner } from "./cli/factory";
import { ensureCliPath, pickCliPath } from "./discovery";
import { registerSessionCommands } from "./commands/session";
import { registerOrphanedCommands } from "./commands/orphaned";
import { registerCreateSessionCommand } from "./commands/createSession";
import { SessionsTreeProvider } from "./tree/provider";
import { TerminalManager } from "./terminal/manager";
import { ensureWorkspaceTerminalFallbackSettings } from "./workspace/fallbackSettings";

function getRunner(cliPath: string) {
  const cfg = readConfig();
  return getCliRunner(cliPath, cfg.debug);
}

export function activate(context: vscode.ExtensionContext): void {
  const terminalManager = new TerminalManager();
  const provider = new SessionsTreeProvider(terminalManager);
  void vscode.commands.executeCommand("setContext", "tmuxAi.degraded", false);
  context.subscriptions.push(vscode.window.registerTreeDataProvider("tmuxAi.sessions", provider));

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("tmuxAi.terminal.useProfileFallback")) {
        void ensureWorkspaceTerminalFallbackSettings();
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("tmuxAi.selectCliPath", async () => {
      await pickCliPath();
      await provider.reload({ interactive: false, silent: true });
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("tmuxAi.refresh", async () => {
      const cliPath = await ensureCliPath(true);
      if (!cliPath) return;
      getRunner(cliPath);
      await provider.reload({ interactive: false, silent: false });
    }),
  );

  registerSessionCommands(context, provider, terminalManager);
  registerOrphanedCommands(context, provider, terminalManager);
  registerCreateSessionCommand(context, provider, terminalManager);

  let passiveSyncTimer: NodeJS.Timeout | null = null;
  context.subscriptions.push(
    vscode.window.onDidChangeWindowState((e) => {
      const cfg = readConfig();
      if (!cfg.passiveSyncEnabled) return;
      if (!e.focused) return;

      if (passiveSyncTimer) clearTimeout(passiveSyncTimer);
      passiveSyncTimer = setTimeout(() => {
        void provider.reload({ interactive: false, silent: true });
      }, 800);
    }),
  );
  context.subscriptions.push({
    dispose: () => {
      if (passiveSyncTimer) clearTimeout(passiveSyncTimer);
    },
  });

  context.subscriptions.push(
    vscode.window.onDidCloseTerminal(() => {
      provider.rehydrateTerminalsFromCache();
    }),
  );

  void ensureWorkspaceTerminalFallbackSettings();
  void provider.reload({ interactive: false, silent: true });
}

export function deactivate(): void {}
