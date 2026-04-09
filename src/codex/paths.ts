import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { pathExists } from '../utils/fs.js';

export async function detectCodexHomes(explicit?: string): Promise<string[]> {
    const candidates = new Set<string>();
    if (explicit) candidates.add(path.resolve(explicit));
    if (process.env.CODEX_HOME) candidates.add(path.resolve(process.env.CODEX_HOME));
    candidates.add(path.join(os.homedir(), '.codex'));
    candidates.add(path.join(os.homedir(), '.codex-cli'));

    const valid: string[] = [];
    for (const candidate of candidates) {
        if (await isValidCodexHome(candidate)) valid.push(candidate);
    }
    return valid;
}

export async function isValidCodexHome(candidate: string): Promise<boolean> {
    const checks = [
        path.join(candidate, 'sessions'),
        path.join(candidate, 'archived_sessions'),
        path.join(candidate, 'session_index.jsonl'),
        path.join(candidate, 'history.jsonl'),
    ];
    for (const item of checks) {
        if (await pathExists(item)) return true;
    }
    return false;
}

export async function ensureCodexHome(candidate?: string): Promise<string> {
    const homes = await detectCodexHomes(candidate);
    if (homes.length === 0) {
        throw new Error('No valid Codex home found. Pass --codex-home to override.');
    }
    return homes[0];
}

export async function appDataRoot(): Promise<string> {
    if (process.platform === 'darwin')
        return path.join(os.homedir(), 'Library', 'Application Support', 'codex-cliner');
    if (process.platform === 'win32')
        return path.join(
            process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'),
            'codex-cliner'
        );
    return path.join(
        process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share'),
        'codex-cliner'
    );
}

export async function hasWorktrees(codexHome: string): Promise<boolean> {
    try {
        const entries = await fs.readdir(path.join(codexHome, 'worktrees'));
        return entries.length > 0;
    } catch {
        return false;
    }
}
