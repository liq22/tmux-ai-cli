import { execFile } from "node:child_process";

import {
  CliErrorBase,
  CliAttachOk,
  CliListOk,
  CliNewOk,
  CliOk,
  CliOkSimple,
  CliRenameOk,
  EXPECTED_PROTOCOL_VERSION,
} from "./protocol";

export class CliProtocolError extends Error {
  public readonly expected: number;
  public readonly actual: unknown;

  constructor(expected: number, actual: unknown) {
    super(`CLI protocolVersion mismatch: expected=${expected}, actual=${String(actual)}`);
    this.name = "CliProtocolError";
    this.expected = expected;
    this.actual = actual;
  }
}

export class CliResponseError extends Error {
  public readonly code: string;
  public readonly hint?: string;
  public readonly protocolVersion: number;

  constructor(resp: CliErrorBase) {
    super(resp.hint ? `${resp.message} (${resp.code})\n${resp.hint}` : `${resp.message} (${resp.code})`);
    this.name = "CliResponseError";
    this.code = resp.code;
    this.hint = resp.hint;
    this.protocolVersion = resp.protocolVersion;
  }
}

export class CliExecError extends Error {
  public readonly exitCode: number;
  public readonly stderr: string;

  constructor(message: string, exitCode: number, stderr: string) {
    super(message);
    this.name = "CliExecError";
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

export interface CliRunnerOptions {
  cliPath: string;
  timeoutMs?: number;
  debug?: boolean;
  env?: NodeJS.ProcessEnv;
}

export class CliRunner {
  private readonly cliPath: string;
  private readonly timeoutMs: number;
  private readonly debug: boolean;
  private readonly env: NodeJS.ProcessEnv | undefined;
  private listInFlight: Promise<CliListOk> | null = null;

  constructor(options: CliRunnerOptions) {
    this.cliPath = options.cliPath;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.debug = options.debug ?? false;
    this.env = options.env;
  }

  async list(): Promise<CliListOk> {
    if (this.listInFlight) return this.listInFlight;
    this.listInFlight = this.execJsonOk<CliListOk>(["list", "--json"]).finally(() => {
      this.listInFlight = null;
    });
    return this.listInFlight;
  }

  newSession(typeId: string, shortName?: string): Promise<CliNewOk> {
    const args = ["new", "--json", "--type", typeId];
    if (shortName) args.push("--name", shortName);
    return this.execJsonOk<CliNewOk>(args);
  }

  attach(shortName: string): Promise<CliAttachOk> {
    return this.execJsonOk<CliAttachOk>(["attach", "--json", shortName]);
  }

  rename(oldShortName: string, newShortName: string): Promise<CliRenameOk> {
    return this.execJsonOk<CliRenameOk>(["rename", "--json", oldShortName, newShortName]);
  }

  kill(shortName: string): Promise<CliOkSimple> {
    return this.execJsonOk<CliOkSimple>(["kill", "--json", shortName]);
  }

  detachAll(shortName: string): Promise<CliOkSimple> {
    return this.execJsonOk<CliOkSimple>(["detach-all", "--json", shortName]);
  }

  private execJsonOk<TOk extends CliOk<object>>(args: string[]): Promise<TOk> {
    return new Promise((resolve, reject) => {
      execFile(
        this.cliPath,
        args,
        {
          timeout: this.timeoutMs,
          maxBuffer: 10 * 1024 * 1024,
          env: this.env,
        },
        (error, stdout, stderr) => {
          const stdoutText = stdout.toString();
          const stderrText = stderr.toString();

          if (this.debug && stderrText.trim().length > 0) {
            console.error(stderrText);
          }

          const exitCode =
            error && typeof error === "object" && "code" in error && typeof error.code === "number"
              ? error.code
              : 0;

          if (error) {
            this.tryParseJsonOk<TOk>(stdoutText)
              .then((parsed) => resolve(parsed))
              .catch((e) => {
                if (e instanceof CliProtocolError || e instanceof CliResponseError) {
                  reject(e);
                  return;
                }
                reject(
                  new CliExecError(
                    `CLI exited with code ${exitCode} (first 200 stdout chars): ${stdoutText.slice(0, 200)}`,
                    exitCode,
                    stderrText,
                  ),
                );
              });
            return;
          }

          this.tryParseJsonOk<TOk>(stdoutText)
            .then((parsed) => resolve(parsed))
            .catch((e) => {
              if (e instanceof CliProtocolError || e instanceof CliResponseError) {
                reject(e);
                return;
              }
              reject(
                new CliExecError(
                  `CLI did not return valid JSON on stdout (first 200 chars): ${stdoutText.slice(0, 200)}`,
                  exitCode,
                  stderrText,
                ),
              );
            });
        },
      );
    });
  }

  private async tryParseJsonOk<TOk extends CliOk<object>>(stdoutText: string): Promise<TOk> {
    let parsed: any;
    try {
      parsed = JSON.parse(stdoutText);
    } catch {
      throw new Error("JSON parse failed");
    }

    if (parsed?.protocolVersion !== EXPECTED_PROTOCOL_VERSION) {
      throw new CliProtocolError(EXPECTED_PROTOCOL_VERSION, parsed?.protocolVersion);
    }

    if (parsed?.ok === false) {
      throw new CliResponseError(parsed as CliErrorBase);
    }

    return parsed as TOk;
  }
}
