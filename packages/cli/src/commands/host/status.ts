import { collectHostStatus } from '../../utils/hosts';
import { printJson, printLines } from '../../utils/output';

export async function runHostStatus(flags: Record<string, string | boolean>): Promise<void> {
  const rows = await collectHostStatus(process.cwd());

  if (flags.json === true) {
    printJson(rows);
    return;
  }

  printLines([
    'Host 状态',
    ...rows.map(
      (row) =>
        `- ${row.host}: manifest=${row.manifest}, shell=${row.shell}, files=${
          row.files.length > 0 ? row.files.join(', ') : 'none'
        }`,
    ),
  ]);
}
