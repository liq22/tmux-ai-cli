import * as vscode from "vscode";

import { getCliEnvOverrides, readConfig } from "./config";
import { getCliRunner } from "./cli/factory";
import { ensureCliPath, pickCliPath } from "./discovery";
import { registerSessionCommands } from "./commands/session";
import { registerOrphanedCommands } from "./commands/orphaned";
import { registerCreateSessionCommand } from "./commands/createSession";
import { registerDiagnosticsCommand } from "./commands/diagnostics";
import { registerCliConfigCommands } from "./commands/cliConfig";
import { registerDetectSocketCommand } from "./commands/detectSocket";
import { SessionsTreeProvider } from "./tree/provider";
import { TerminalManager } from "./terminal/manager";
import { ensureWorkspaceTerminalFallbackSettings } from "./workspace/fallbackSettings";
import { syncWorkspaceTerminalProfiles } from "./workspace/profileFallback";

function getRunner(cliPath: string) {
  const cfg = readConfig();
  return getCliRunner(cliPath, { debug: cfg.debug, envOverrides: getCliEnvOverrides(cfg) });
}

export function activate(context: vscode.ExtensionContext): void {
  const terminalManager = new TerminalManager();
  const provider = new SessionsTreeProvider(terminalManager, async ({ list, cliPath }) => {
    await ensureWorkspaceTerminalFallbackSettings();
    await syncWorkspaceTerminalProfiles({ context, cliPath, list });
  });
  void vscode.commands.executeCommand("setContext", "tmuxAi.degraded", false);
  context.subscriptions.push(vscode.window.registerTreeDataProvider("tmuxAi.sessions", provider));

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration("tmuxAi.terminal.useProfileFallback") ||
        e.affectsConfiguration("tmuxAi.terminal.nameFormat") ||
        e.affectsConfiguration("tmuxAi.cliPath") ||
        e.affectsConfiguration("tmuxAi.cli.socket") ||
        e.affectsConfiguration("tmuxAi.cli.configDir")
      ) {
        void (async () => {
          await ensureWorkspaceTerminalFallbackSettings();
          const cfg = readConfig();
          if (!cfg.terminalUseProfileFallback) return;
          const list = provider.getLatestList();
          if (!list) return;
          const cliPath = await ensureCliPath(false);
          if (!cliPath) return;
          await syncWorkspaceTerminalProfiles({ context, cliPath, list });
        })();
      }

      if (e.affectsConfiguration("tmuxAi.cli.socket") || e.affectsConfiguration("tmuxAi.cli.configDir")) {
        void provider.reload({ interactive: false, silent: true });
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
  registerDiagnosticsCommand(context);
  registerCliConfigCommands(context, provider);
  registerDetectSocketCommand(context, provider);

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
