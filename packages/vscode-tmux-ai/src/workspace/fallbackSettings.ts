import * as vscode from "vscode";

import { readConfig } from "../config";

interface WorkspaceSettingUpdate {
  key: string;
  value: unknown;
}

interface WorkspaceConfigurationInspectLike<T> {
  workspaceValue?: T;
  workspaceFolderValue?: T;
}

function hasWorkspaceValue(inspected: WorkspaceConfigurationInspectLike<unknown> | undefined): boolean {
  if (!inspected) return false;
  return inspected.workspaceValue !== undefined || inspected.workspaceFolderValue !== undefined;
}

export async function ensureWorkspaceTerminalFallbackSettings(): Promise<void> {
  const cfg = readConfig();
  if (!cfg.terminalUseProfileFallback) return;

  if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) return;

  const updates: WorkspaceSettingUpdate[] = [
    { key: "terminal.integrated.tabs.enabled", value: true },
    { key: "terminal.integrated.tabs.title", value: "${sequence}" },
    { key: "terminal.integrated.tabs.defaultIcon", value: "terminal-tmux" },
  ];

  const root = vscode.workspace.getConfiguration();
  for (const u of updates) {
    const inspected = root.inspect(u.key);
    if (hasWorkspaceValue(inspected)) continue;
    await root.update(u.key, u.value, vscode.ConfigurationTarget.Workspace);
  }
}
