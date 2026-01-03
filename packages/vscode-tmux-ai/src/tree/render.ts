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

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function deriveInstanceColor(shortName: string): vscode.ThemeColor {
  const idx = hashString(shortName) % INSTANCE_COLOR_KEYS.length;
  return new vscode.ThemeColor(INSTANCE_COLOR_KEYS[idx]);
}

export function formatLastUsedDescription(session: CliSessionInfo): string {
  if (!session.lastUsed) return "Last used: unknown";
  return `Last used: ${session.lastUsed}`;
}

