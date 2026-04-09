import fs from 'node:fs/promises';
import { URL } from 'node:url';

const pkg = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
const changelog = await fs.readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const version = pkg.version;

if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
    console.error(`Invalid package version: ${version}`);
    process.exit(1);
}

if (!changelog.includes(`## [${version}]`)) {
    console.error(`CHANGELOG.md is missing an entry for version ${version}`);
    process.exit(1);
}

console.log(`Release check passed for ${version}`);
