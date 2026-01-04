import * as vscode from "vscode";

import { CliListOk } from "../cli/protocol";
import { readConfig } from "../config";
import { formatPrimaryTerminalName } from "../terminal/naming";
import { deriveInstanceColorKey } from "../tree/render";

type TerminalProfilesPlatformKey = "linux" | "osx" | "windows";

interface TerminalProfile {
  path: string;
  args: string[];
  env?: Record<string, string>;
  overrideName: boolean;
  icon: string;
  color: string;
}

function getProfilesPlatformKey(): TerminalProfilesPlatformKey {
  if (process.platform === "win32") return "windows";
  if (process.platform === "darwin") return "osx";
  return "linux";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const aKeys = Object.keys(a).sort();
    const bKeys = Object.keys(b).sort();
    if (aKeys.length !== bKeys.length) return false;
    for (let i = 0; i < aKeys.length; i++) {
      const k = aKeys[i];
      if (k !== bKeys[i]) return false;
      if (!deepEqual(a[k], b[k])) return false;
    }
    return true;
  }

  return false;
}

function managedStateKey(platform: TerminalProfilesPlatformKey): string {
  return `tmuxAi.profileFallback.managedProfiles.${platform}`;
}

export async function syncWorkspaceTerminalProfiles(options: {
  context: vscode.ExtensionContext;
  cliPath: string;
  list: CliListOk;
}): Promise<void> {
  const cfg = readConfig();
  if (!cfg.terminalUseProfileFallback) return;

  if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) return;

  const platform = getProfilesPlatformKey();
  const settingKey = `terminal.integrated.profiles.${platform}`;
  const root = vscode.workspace.getConfiguration();

  const inspected = root.inspect<unknown>(settingKey);
  const existingWorkspaceValue = inspected?.workspaceValue;
  const baseProfiles: Record<string, unknown> = isPlainObject(existingWorkspaceValue) ? { ...existingWorkspaceValue } : {};

  const stateKey = managedStateKey(platform);
  const managed = new Set(options.context.workspaceState.get<string[]>(stateKey) ?? []);

  const nextProfiles: Record<string, unknown> = { ...baseProfiles };
  const nextManaged = new Set<string>();

  const sessions = options.list.sessions.slice().sort((a, b) => a.shortName.localeCompare(b.shortName));
  for (const session of sessions) {
    const profileName = formatPrimaryTerminalName(cfg.terminalNameFormat, session.shortName);

    if (profileName in baseProfiles && !managed.has(profileName)) {
      continue;
    }

    const icon = options.list.types[session.type]?.icon || "terminal";
    const env: Record<string, string> = {};
    if (cfg.cliSocket) env.TMUX_AI_SOCKET = cfg.cliSocket;
    if (cfg.cliConfigDir) env.TMUX_AI_CONFIG = cfg.cliConfigDir;
    if (cfg.cliTmuxTmpDir) env.TMUX_TMPDIR = cfg.cliTmuxTmpDir;
    const profile: TerminalProfile = {
      path: options.cliPath,
      args: ["attach", session.shortName],
      ...(Object.keys(env).length > 0 ? { env } : {}),
      overrideName: true,
      icon,
      color: deriveInstanceColorKey(session.shortName),
    };

    nextProfiles[profileName] = profile;
    nextManaged.add(profileName);
  }

  for (const profileName of managed) {
    if (nextManaged.has(profileName)) continue;
    if (profileName in nextProfiles) delete nextProfiles[profileName];
  }

  const didChange = !deepEqual(baseProfiles, nextProfiles);
  const nextManagedList = Array.from(nextManaged).sort();
  const managedChanged = !deepEqual(Array.from(managed).sort(), nextManagedList);

  if (!didChange && !managedChanged) return;

  if (didChange) {
    await root.update(settingKey, nextProfiles, vscode.ConfigurationTarget.Workspace);
  }
  if (managedChanged) {
    await options.context.workspaceState.update(stateKey, nextManagedList);
  }
}
