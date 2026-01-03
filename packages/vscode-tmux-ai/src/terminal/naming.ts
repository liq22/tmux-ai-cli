export interface TerminalNameParts {
  shortName: string;
  k: number;
}

export interface TerminalNamingConfig {
  nameFormat: string;
  multiClientNameFormat: string;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileFormatToRegex(format: string): RegExp {
  const WS = "\u0000WS\u0000";
  const SHORT = "\u0000SHORT\u0000";
  const K = "\u0000K\u0000";

  let tmp = format;
  tmp = tmp.replace(/\s+/g, WS);
  tmp = tmp.replaceAll("{shortName}", SHORT);
  tmp = tmp.replaceAll("{k}", K);

  tmp = escapeRegex(tmp);
  tmp = tmp.replaceAll(escapeRegex(WS), "\\s+");
  tmp = tmp.replaceAll(escapeRegex(SHORT), "([A-Za-z0-9_-]+)");
  tmp = tmp.replaceAll(escapeRegex(K), "([0-9]+)");

  return new RegExp(`^${tmp}$`);
}

export function formatPrimaryTerminalName(format: string, shortName: string): string {
  return format.replaceAll("{shortName}", shortName);
}

export function formatMultiClientTerminalName(
  format: string,
  shortName: string,
  k: number,
): string {
  return format.replaceAll("{shortName}", shortName).replaceAll("{k}", String(k));
}

export function parseTerminalName(name: string, config: TerminalNamingConfig): TerminalNameParts | null {
  const primaryRe = compileFormatToRegex(config.nameFormat);
  const multiRe = compileFormatToRegex(config.multiClientNameFormat);

  const primaryMatch = name.match(primaryRe);
  if (primaryMatch) {
    return { shortName: primaryMatch[1], k: 1 };
  }

  const multiMatch = name.match(multiRe);
  if (multiMatch) {
    return { shortName: multiMatch[1], k: Number(multiMatch[2]) };
  }

  // Legacy compatibility: default name formats used by tmux-ai-cli profiles.
  const legacyPrimary = name.match(/^AI:\s*([A-Za-z0-9_-]+)$/);
  if (legacyPrimary) {
    return { shortName: legacyPrimary[1], k: 1 };
  }
  const legacyMulti = name.match(/^AI:\s*([A-Za-z0-9_-]+)\s*\((\d+)\)$/);
  if (legacyMulti) {
    return { shortName: legacyMulti[1], k: Number(legacyMulti[2]) };
  }

  return null;
}

