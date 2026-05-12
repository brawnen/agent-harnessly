import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8')) as { name: string; version: string };

export const CLI_PACKAGE_NAME: string = pkg.name;
export const CLI_VERSION: string = pkg.version;
