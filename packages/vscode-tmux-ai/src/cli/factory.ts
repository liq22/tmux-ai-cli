import { CliRunner } from "./runner";

let cached: { key: string; runner: CliRunner } | null = null;

export function getCliRunner(cliPath: string, debug: boolean): CliRunner {
  const key = `${cliPath}::${debug ? "1" : "0"}`;
  if (cached?.key === key) return cached.runner;
  cached = { key, runner: new CliRunner({ cliPath, debug }) };
  return cached.runner;
}

