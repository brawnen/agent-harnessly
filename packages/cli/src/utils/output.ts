export function printJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

export function printLines(lines: string[]): void {
  process.stdout.write(`${lines.join('\n')}\n`);
}
