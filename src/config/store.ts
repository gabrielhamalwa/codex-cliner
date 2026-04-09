import path from 'node:path';
import { promises as fs } from 'node:fs';
import { appDataRoot, isValidCodexHome } from '../codex/paths.js';
import { atomicWriteJson, ensureDir } from '../utils/fs.js';

export interface AppConfig {
    lastCodexHome?: string;
    recentCodexHomes: string[];
}

const DEFAULT_CONFIG: AppConfig = {
    recentCodexHomes: [],
};

async function configPath(): Promise<string> {
    return path.join(await appDataRoot(), 'config.json');
}

export async function getAppConfigPath(): Promise<string> {
    return configPath();
}

export async function readAppConfig(): Promise<AppConfig> {
    try {
        const filePath = await configPath();
        const content = JSON.parse(await fs.readFile(filePath, 'utf8')) as Partial<AppConfig>;
        return {
            lastCodexHome: content.lastCodexHome,
            recentCodexHomes: Array.isArray(content.recentCodexHomes)
                ? content.recentCodexHomes.filter(
                      (item): item is string => typeof item === 'string'
                  )
                : [],
        };
    } catch {
        return { ...DEFAULT_CONFIG };
    }
}

export async function saveSelectedCodexHome(codexHome: string): Promise<void> {
    const current = await readAppConfig();
    const nextRecent = [
        codexHome,
        ...current.recentCodexHomes.filter((item) => item !== codexHome),
    ].slice(0, 5);
    const next: AppConfig = {
        lastCodexHome: codexHome,
        recentCodexHomes: nextRecent,
    };
    const root = await appDataRoot();
    await ensureDir(root);
    await atomicWriteJson(await configPath(), next);
}

export async function resolveSavedCodexHome(): Promise<string | undefined> {
    const config = await readAppConfig();
    if (!config.lastCodexHome) return undefined;
    return (await isValidCodexHome(config.lastCodexHome)) ? config.lastCodexHome : undefined;
}

export async function resetAppConfig(): Promise<void> {
    try {
        await fs.rm(await configPath(), { force: true });
    } catch {
        // ignore
    }
}
