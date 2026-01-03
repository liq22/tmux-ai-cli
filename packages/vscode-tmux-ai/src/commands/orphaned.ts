import * as vscode from "vscode";

import { OrphanedTerminalNode } from "../tree/items";
import { SessionsTreeProvider } from "../tree/provider";
import { TerminalManager } from "../terminal/manager";

export function registerOrphanedCommands(
  context: vscode.ExtensionContext,
  provider: SessionsTreeProvider,
  terminalManager: TerminalManager,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("tmuxAi.orphan.closeTerminal", async (node: OrphanedTerminalNode) => {
      if (!node?.info?.terminal) return;
      try {
        node.info.terminal.dispose();
        provider.rehydrateTerminalsFromCache();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Close terminal failed: ${message}`);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("tmuxAi.orphan.closeAll", async () => {
      const orphaned = terminalManager.getOrphaned();
      if (orphaned.length === 0) return;

      const choice = await vscode.window.showWarningMessage(
        `Close ${orphaned.length} orphaned terminal(s)?`,
        { modal: true },
        "Close All",
        "Cancel",
      );
      if (choice !== "Close All") return;

      for (const info of orphaned) {
        try {
          info.terminal.dispose();
        } catch {
          // ignore
        }
      }
      provider.rehydrateTerminalsFromCache();
    }),
  );
}

