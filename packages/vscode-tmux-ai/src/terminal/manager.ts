import * as vscode from "vscode";

import { CliSessionInfo } from "../cli/protocol";
import { readConfig } from "../config";

import { parseTerminalName } from "./naming";

export interface SessionTerminalInfo {
  terminal: vscode.Terminal;
  k: number;
}

export interface OrphanedTerminalInfo {
  terminal: vscode.Terminal;
  name: string;
  shortName: string;
  k: number;
}

export class TerminalManager {
  private liveSessions = new Map<string, CliSessionInfo>();
  private terminalsByShortName = new Map<string, SessionTerminalInfo[]>();
  private primaryByShortName = new Map<string, vscode.Terminal>();
  private orphaned: OrphanedTerminalInfo[] = [];

  rehydrate(sessions: CliSessionInfo[]): void {
    this.liveSessions = new Map(sessions.map((s) => [s.shortName, s]));
    this.terminalsByShortName.clear();
    this.primaryByShortName.clear();
    this.orphaned = [];

    const cfg = readConfig();
    const naming = {
      nameFormat: cfg.terminalNameFormat,
      multiClientNameFormat: cfg.terminalMultiClientNameFormat,
    };

    for (const terminal of vscode.window.terminals) {
      const parts = parseTerminalName(terminal.name, naming);
      if (!parts) continue;

      if (!this.liveSessions.has(parts.shortName)) {
        this.orphaned.push({
          terminal,
          name: terminal.name,
          shortName: parts.shortName,
          k: parts.k,
        });
        continue;
      }

      const list = this.terminalsByShortName.get(parts.shortName) ?? [];
      list.push({ terminal, k: parts.k });
      this.terminalsByShortName.set(parts.shortName, list);
    }

    for (const [shortName, list] of this.terminalsByShortName.entries()) {
      list.sort((a, b) => a.k - b.k);
      const primary = list.find((t) => t.k === 1) ?? list[0];
      if (primary) this.primaryByShortName.set(shortName, primary.terminal);
    }
  }

  getPrimary(shortName: string): vscode.Terminal | undefined {
    return this.primaryByShortName.get(shortName);
  }

  getNextClientIndex(shortName: string): number {
    const list = this.terminalsByShortName.get(shortName) ?? [];
    let maxK = 1;
    for (const t of list) {
      if (Number.isFinite(t.k) && t.k > maxK) maxK = t.k;
    }
    return Math.max(2, maxK + 1);
  }

  trackSessionTerminal(shortName: string, k: number, terminal: vscode.Terminal): void {
    if (!this.liveSessions.has(shortName)) return;

    const list = this.terminalsByShortName.get(shortName) ?? [];
    list.push({ terminal, k });
    this.terminalsByShortName.set(shortName, list);

    const existingPrimary = this.primaryByShortName.get(shortName);
    if (!existingPrimary) {
      this.primaryByShortName.set(shortName, terminal);
      return;
    }
    if (k === 1) {
      this.primaryByShortName.set(shortName, terminal);
    }
  }

  getOrphaned(): OrphanedTerminalInfo[] {
    return this.orphaned.slice();
  }
}

