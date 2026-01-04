import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";

export interface TmuxBackendCandidate {
  tmuxTmpDir: string;
  socket: string;
}

function expandPathTemplate(p: string): string {
  const home = os.homedir();
  if (p === "~") return home;
  if (p.startsWith("~" + path.sep)) return path.join(home, p.slice(2));
  return p.replaceAll("$HOME", home);
}

function tmuxSocketDir(tmuxTmpDir: string): string | null {
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  if (uid === null) return null;
  return path.join(tmuxTmpDir, `tmux-${uid}`);
}

export function candidateTmuxTmpDirs(extra: string[]): string[] {
  const bases = new Set<string>();
  for (const d of extra) bases.add(d);
  if (process.env.TMUX_TMPDIR) bases.add(process.env.TMUX_TMPDIR);
  bases.add("/tmp");
  bases.add(os.tmpdir());
  bases.add(path.join(os.homedir(), ".tmux-tmp"));

  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    bases.add(path.join(folder.uri.fsPath, ".tmux-tmp"));
  }

  return Array.from(bases)
    .filter((p) => p && p.trim().length > 0)
    .map((p) => expandPathTemplate(p.trim()));
}

export async function listSocketCandidates(tmpDirs: string[]): Promise<TmuxBackendCandidate[]> {
  const candidates: TmuxBackendCandidate[] = [];
  const seen = new Set<string>();
  for (const tmuxTmpDir of tmpDirs) {
    const socketDir = tmuxSocketDir(tmuxTmpDir);
    if (!socketDir) continue;
    try {
      const entries = await fs.readdir(socketDir);
      for (const entry of entries) {
        const full = path.join(socketDir, entry);
        try {
          const st = await fs.lstat(full);
          if (!st.isSocket()) continue;
          const key = `${tmuxTmpDir}::${entry}`;
          if (seen.has(key)) continue;
          seen.add(key);
          candidates.push({ tmuxTmpDir, socket: entry });
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
  }
  return candidates.sort((a, b) => a.socket.localeCompare(b.socket) || a.tmuxTmpDir.localeCompare(b.tmuxTmpDir));
}

