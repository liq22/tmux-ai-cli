export function isValidShortName(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

