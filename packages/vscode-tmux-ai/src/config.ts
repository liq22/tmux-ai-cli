import * as vscode from "vscode";

export type CliPath = string | null;

export interface TmuxAiConfig {
  cliPath: CliPath;
  cliSocket: string | null;
  cliConfigDir: string | null;
  cliTmuxTmpDir: string | null;
  cliAutoInstallBundled: boolean;
  cliAutoDetectBackend: boolean;
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
  const cliSocket = cfg.get<string | null>("cli.socket", null);
  const cliConfigDir = cfg.get<string | null>("cli.configDir", null);
  const cliTmuxTmpDir = cfg.get<string | null>("cli.tmuxTmpDir", null);
  const cliAutoInstallBundled = cfg.get<boolean>("cli.autoInstallBundled", true);
  const cliAutoDetectBackend = cfg.get<boolean>("cli.autoDetectBackend", true);
  return {
    cliPath: cliPath && cliPath.trim().length > 0 ? cliPath.trim() : null,
    cliSocket: cliSocket && cliSocket.trim().length > 0 ? cliSocket.trim() : null,
    cliConfigDir: cliConfigDir && cliConfigDir.trim().length > 0 ? cliConfigDir.trim() : null,
    cliTmuxTmpDir: cliTmuxTmpDir && cliTmuxTmpDir.trim().length > 0 ? cliTmuxTmpDir.trim() : null,
    cliAutoInstallBundled,
    cliAutoDetectBackend,
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

export interface CliEnvOverrides {
  TMUX_AI_SOCKET?: string;
  TMUX_AI_CONFIG?: string;
  TMUX_TMPDIR?: string;
}

export function getCliEnvOverrides(cfg: TmuxAiConfig): CliEnvOverrides {
  const overrides: CliEnvOverrides = {};
  if (cfg.cliSocket) overrides.TMUX_AI_SOCKET = cfg.cliSocket;
  if (cfg.cliConfigDir) overrides.TMUX_AI_CONFIG = cfg.cliConfigDir;
  if (cfg.cliTmuxTmpDir) overrides.TMUX_TMPDIR = cfg.cliTmuxTmpDir;
  return overrides;
}

export async function updateCliPath(value: CliPath): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("tmuxAi");
  await cfg.update("cliPath", value, vscode.ConfigurationTarget.Global);
}

export async function updateCliSocket(value: string | null): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("tmuxAi");
  await cfg.update("cli.socket", value, vscode.ConfigurationTarget.Global);
}

export async function updateCliConfigDir(value: string | null): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("tmuxAi");
  await cfg.update("cli.configDir", value, vscode.ConfigurationTarget.Global);
}

export async function updateCliTmuxTmpDir(value: string | null): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("tmuxAi");
  await cfg.update("cli.tmuxTmpDir", value, vscode.ConfigurationTarget.Global);
}
