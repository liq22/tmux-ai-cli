import * as vscode from "vscode";

import { readConfig } from "../config";

import { parseTerminalName } from "./naming";

export function findPrimaryTerminal(shortName: string): vscode.Terminal | null {
  const cfg = readConfig();
  for (const terminal of vscode.window.terminals) {
    const parts = parseTerminalName(terminal.name, {
      nameFormat: cfg.terminalNameFormat,
      multiClientNameFormat: cfg.terminalMultiClientNameFormat,
    });
    if (!parts) continue;
    if (parts.shortName !== shortName) continue;
    if (parts.k === 1) return terminal;
  }
  return null;
}

export function listTerminalsForSession(shortName: string): Array<{ terminal: vscode.Terminal; k: number }> {
  const cfg = readConfig();
  const results: Array<{ terminal: vscode.Terminal; k: number }> = [];
  for (const terminal of vscode.window.terminals) {
    const parts = parseTerminalName(terminal.name, {
      nameFormat: cfg.terminalNameFormat,
      multiClientNameFormat: cfg.terminalMultiClientNameFormat,
    });
    if (!parts) continue;
    if (parts.shortName !== shortName) continue;
    results.push({ terminal, k: parts.k });
  }
  return results;
}

export function nextClientIndex(shortName: string): number {
  const terminals = listTerminalsForSession(shortName);
  let maxK = 1;
  for (const t of terminals) {
    if (Number.isFinite(t.k) && t.k > maxK) maxK = t.k;
  }
  return Math.max(2, maxK + 1);
}

