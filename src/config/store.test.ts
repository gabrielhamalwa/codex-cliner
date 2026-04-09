import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    getAppConfigPath,
    readAppConfig,
    resetAppConfig,
    resolveSavedCodexHome,
    saveSelectedCodexHome,
} from './store.js';

const tempRoot = path.join(os.tmpdir(), 'codex-cliner-config-tests');

vi.mock('../codex/paths.js', () => ({
    appDataRoot: async () => tempRoot,
    isValidCodexHome: async (candidate: string) => candidate.includes('valid-codex'),
}));

afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('config store', () => {
    it('persists the selected codex home and keeps recent homes deduplicated', async () => {
        await saveSelectedCodexHome('/tmp/valid-codex-a');
        await saveSelectedCodexHome('/tmp/valid-codex-b');
        await saveSelectedCodexHome('/tmp/valid-codex-a');

        const config = await readAppConfig();
        expect(config.lastCodexHome).toBe('/tmp/valid-codex-a');
        expect(config.recentCodexHomes).toEqual(['/tmp/valid-codex-a', '/tmp/valid-codex-b']);
    });

    it('resolves the saved codex home only when it is still valid', async () => {
        await saveSelectedCodexHome('/tmp/valid-codex-a');
        expect(await resolveSavedCodexHome()).toBe('/tmp/valid-codex-a');

        await fs.writeFile(
            path.join(tempRoot, 'config.json'),
            JSON.stringify({
                lastCodexHome: '/tmp/invalid-home',
                recentCodexHomes: ['/tmp/invalid-home'],
            })
        );
        expect(await resolveSavedCodexHome()).toBeUndefined();
    });

    it('resets the stored config', async () => {
        await saveSelectedCodexHome('/tmp/valid-codex-a');
        await resetAppConfig();

        expect(await readAppConfig()).toEqual({ recentCodexHomes: [] });
        await expect(fs.access(await getAppConfigPath())).rejects.toBeDefined();
    });
});
