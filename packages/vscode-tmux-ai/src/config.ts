import * as vscode from "vscode";

export type CliPath = string | null;

export interface TmuxAiConfig {
  cliPath: CliPath;
  discoverySearchPaths: string[];
  namingPattern: string;
  passiveSyncEnabled: boolean;
  terminalNameFormat: string;
  terminalMultiClientNameFormat: string;
  terminalUseProfileFallback: boolean;
  confirmDestructiveActions: boolean;
  debug: boolean;
}

export function readConfig(): TmuxAiConfig {
  const cfg = vscode.workspace.getConfiguration("tmuxAi");
  const cliPath = cfg.get<string | null>("cliPath", null);
  return {
    cliPath: cliPath && cliPath.trim().length > 0 ? cliPath.trim() : null,
    discoverySearchPaths: cfg.get<string[]>("discovery.searchPaths", []),
    namingPattern: cfg.get<string>("namingPattern", "{type}-{n}"),
    passiveSyncEnabled: cfg.get<boolean>("passiveSync.enabled", true),
    terminalNameFormat: cfg.get<string>("terminal.nameFormat", "AI: {shortName}"),
    terminalMultiClientNameFormat: cfg.get<string>(
      "terminal.multiClientNameFormat",
      "AI: {shortName} ({k})",
    ),
    terminalUseProfileFallback: cfg.get<boolean>("terminal.useProfileFallback", false),
    confirmDestructiveActions: cfg.get<boolean>("confirm.destructiveActions", true),
    debug: cfg.get<boolean>("debug", false),
  };
}

export async function updateCliPath(value: CliPath): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("tmuxAi");
  await cfg.update("cliPath", value, vscode.ConfigurationTarget.Global);
}
