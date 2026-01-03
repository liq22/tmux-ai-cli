import * as vscode from "vscode";

import { CliSessionInfo } from "../cli/protocol";

const INSTANCE_COLOR_KEYS = [
  "terminal.ansiRed",
  "terminal.ansiGreen",
  "terminal.ansiYellow",
  "terminal.ansiBlue",
  "terminal.ansiMagenta",
  "terminal.ansiCyan",
] as const;

export type InstanceColorKey = (typeof INSTANCE_COLOR_KEYS)[number];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function deriveInstanceColorKey(shortName: string): InstanceColorKey {
  const idx = hashString(shortName) % INSTANCE_COLOR_KEYS.length;
  return INSTANCE_COLOR_KEYS[idx];
}

export function deriveInstanceColor(shortName: string): vscode.ThemeColor {
  return new vscode.ThemeColor(deriveInstanceColorKey(shortName));
}

export function formatLastUsedDescription(session: CliSessionInfo): string {
  if (!session.lastUsed) return "Last used: unknown";
  return `Last used: ${session.lastUsed}`;
}
