import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const testDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDir, '..');
let builtCliPath = '';
type CliEnv = Record<string, string | undefined>;
let buildRoot = '';

async function makeCodexHomeFixture(): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-cliner-cli-'));
    await fs.mkdir(path.join(root, 'sessions', '2026', '04', '10'), { recursive: true });
    await fs.mkdir(path.join(root, 'archived_sessions'), { recursive: true });
    await fs.writeFile(
        path.join(
            root,
            'sessions',
            '2026',
            '04',
            '10',
            'rollout-2026-04-10T10-00-00-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jsonl'
        ),
        JSON.stringify({
            type: 'session_meta',
            payload: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', cwd: '/tmp/example-project' },
        }) + '\n'
    );
    await fs.writeFile(
        path.join(root, 'session_index.jsonl'),
        JSON.stringify({
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            thread_name: 'Fallback test',
            updated_at: '2026-04-10T10:00:00Z',
        }) + '\n'
    );
    await fs.writeFile(path.join(root, 'history.jsonl'), '');
    return root;
}

async function runCli(args: string[], env?: CliEnv) {
    return execFileAsync(process.execPath, [builtCliPath, ...args], {
        cwd: projectRoot,
        env: { ...process.env, FORCE_COLOR: '0', ...env },
    });
}

describe('cli', () => {
    beforeAll(async () => {
        buildRoot = path.join(projectRoot, '.vitest-cli-dist');
        const outDir = path.join(buildRoot, 'dist');

        await execFileAsync(
            'bunx',
            ['tsup', 'src/cli.ts', '--format', 'esm', '--out-dir', outDir, '--clean'],
            {
                cwd: projectRoot,
                env: { ...process.env, FORCE_COLOR: '0' },
            }
        );

        builtCliPath = path.join(outDir, 'cli.js');
    }, 30000);

    afterAll(async () => {
        if (buildRoot) {
            await fs.rm(buildRoot, { recursive: true, force: true });
        }
    });

    it('falls back cleanly when interactive mode is started without a TTY', async () => {
        const codexHome = await makeCodexHomeFixture();
        const { stdout, stderr } = await runCli(['--codex-home', codexHome]);

        expect(stderr).toContain(
            'Interactive mode requires a real TTY. Falling back to a non-interactive summary.'
        );
        expect(stdout).toContain('Doctor');
        expect(stdout).toContain(`Codex home: ${codexHome}`);
    }, 15000);

    it('shows the saved config and can reset it', async () => {
        const configRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-cliner-cli-config-'));
        const homeRoot = path.join(configRoot, 'home');
        const configDir = path.join(homeRoot, 'Library', 'Application Support', 'codex-cliner');
        const { stdout: resetStdout } = await runCli(['config', 'reset'], { HOME: homeRoot });

        expect(resetStdout).toContain('Saved codex-cliner configuration cleared.');

        await fs.mkdir(configDir, { recursive: true });
        await fs.writeFile(
            path.join(configDir, 'config.json'),
            JSON.stringify({
                lastCodexHome: '/tmp/example-codex',
                recentCodexHomes: ['/tmp/example-codex', '/tmp/other-codex'],
            })
        );

        const { stdout } = await runCli(['config', 'show'], { HOME: homeRoot });

        expect(stdout).toContain('Last Codex home: /tmp/example-codex');
        expect(stdout).toContain('/tmp/other-codex');
    }, 15000);
});
