import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    createBackupRun,
    listBackupRuns,
    rebuildCatalog,
    removeBrokenCatalog,
    restoreBackup,
} from './manager.js';

const tempRoot = path.join(os.tmpdir(), 'codex-cliner-tests');

vi.mock('../codex/paths.js', () => ({
    appDataRoot: async () => tempRoot,
}));

afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('backup manager', () => {
    it('creates backups and rebuilds catalog from manifests', async () => {
        const sourceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-cliner-source-'));
        const sourceFile = path.join(sourceRoot, 'sessions', 'test.jsonl');
        await fs.mkdir(path.dirname(sourceFile), { recursive: true });
        await fs.writeFile(sourceFile, 'hello');

        const run = await createBackupRun({
            actionType: 'delete-sessions',
            codexHome: sourceRoot,
            sessionIds: ['session-1'],
            sourcePaths: [{ sourcePath: sourceFile, kind: 'session' }],
        });

        expect(run.manifest.items).toHaveLength(1);
        await removeBrokenCatalog();
        const catalog = await rebuildCatalog();
        expect(catalog).toHaveLength(1);
        expect(catalog[0]?.runId).toBe(run.manifest.runId);
    });

    it('restores a file from a backup run', async () => {
        const sourceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-cliner-source-'));
        const sourceFile = path.join(sourceRoot, 'history.jsonl');
        await fs.writeFile(sourceFile, 'before');
        const run = await createBackupRun({
            actionType: 'cleanup-stale',
            codexHome: sourceRoot,
            sessionIds: ['session-1'],
            sourcePaths: [{ sourcePath: sourceFile, kind: 'history' }],
        });

        await fs.writeFile(sourceFile, 'after');
        const restored = await restoreBackup({
            runId: run.manifest.runId,
            restoreAll: true,
            items: [],
        });
        expect(restored).toBe(1);
        expect(await fs.readFile(sourceFile, 'utf8')).toBe('before');
        expect((await listBackupRuns())[0]?.manifest.runId).toBe(run.manifest.runId);
    });

    it('restores only selected files from a backup run', async () => {
        const sourceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-cliner-source-'));
        const firstFile = path.join(sourceRoot, 'history.jsonl');
        const secondFile = path.join(sourceRoot, 'session_index.jsonl');
        await fs.writeFile(firstFile, 'history-before');
        await fs.writeFile(secondFile, 'index-before');

        const run = await createBackupRun({
            actionType: 'cleanup-stale',
            codexHome: sourceRoot,
            sessionIds: ['session-1'],
            sourcePaths: [
                { sourcePath: firstFile, kind: 'history' },
                { sourcePath: secondFile, kind: 'index' },
            ],
        });

        await fs.writeFile(firstFile, 'history-after');
        await fs.writeFile(secondFile, 'index-after');

        const selectedItem = run.manifest.items.find((item) => item.sourcePath === firstFile);
        const restored = await restoreBackup({
            runId: run.manifest.runId,
            restoreAll: false,
            items: selectedItem ? [selectedItem] : [],
        });

        expect(restored).toBe(1);
        expect(await fs.readFile(firstFile, 'utf8')).toBe('history-before');
        expect(await fs.readFile(secondFile, 'utf8')).toBe('index-after');
    });
});
