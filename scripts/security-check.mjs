import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const allowlist = new Set([
    'src/commands/actions.ts',
    'src/backups/manager.ts',
    'src/utils/fs.ts',
    'src/backups/manager.test.ts',
    'src/cli.test.ts',
    'scripts/security-check.mjs',
]);

const patterns = [
    {
        name: 'child_process',
        regex: /node:child_process|from\s+['"]node:child_process['"]|require\(['"]node:child_process['"]\)/,
    },
    { name: 'eval', regex: /\beval\s*\(/ },
    { name: 'new-function', regex: /new\s+Function\s*\(/ },
    { name: 'exec-sync', regex: /\bexecSync\s*\(|\bspawnSync\s*\(|\bexecFileSync\s*\(/ },
    { name: 'shell-rm-rf', regex: /rm\s+-rf/ },
    { name: 'shell-sudo', regex: /\bsudo\b/ },
    { name: 'recursive-rm', regex: /fs\.rm[\s\S]{0,120}recursive\s*:\s*true/ },
];

const ignoredDirs = new Set(['node_modules', 'dist', '.git', 'codex-clean-main']);
const files = [];
await collectFiles(rootDir, files);

const findings = [];
for (const absolutePath of files) {
    const relativePath = path.relative(rootDir, absolutePath).replace(/\\/g, '/');
    const content = await fs.readFile(absolutePath, 'utf8');
    for (const pattern of patterns) {
        if (pattern.regex.test(content) && !allowlist.has(relativePath)) {
            findings.push(`${relativePath}: ${pattern.name}`);
        }
    }
}

if (findings.length > 0) {
    console.error(
        'Security check failed. Potentially dangerous patterns were found outside the allowlist:'
    );
    for (const finding of findings) {
        console.error(`- ${finding}`);
    }
    process.exit(1);
}

console.log('Security check passed. No unexpected dangerous patterns found.');

async function collectFiles(dir, files) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isDirectory()) {
            if (!ignoredDirs.has(entry.name)) {
                await collectFiles(path.join(dir, entry.name), files);
            }
            continue;
        }
        if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) {
            files.push(path.join(dir, entry.name));
        }
    }
}
