import { installHostShells } from '../../utils/hosts';
import { printLines } from '../../utils/output';

export async function runHostSync(flags: Record<string, string | boolean>): Promise<void> {
  const requestedHost = typeof flags.host === 'string' ? flags.host : 'auto';
  const installedPaths = await installHostShells(process.cwd(), requestedHost);

  printLines([
    'Host shell 已按 source-of-truth 重写',
    `- host: ${requestedHost}`,
    `- files: ${installedPaths.length > 0 ? installedPaths.join(', ') : 'none'}`,
  ]);
}
