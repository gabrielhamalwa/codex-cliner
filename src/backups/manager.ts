import path from 'node:path';
import { promises as fs } from 'node:fs';
import type {
    BackupActionType,
    BackupCatalogEntry,
    BackupManifest,
    BackupManifestItem,
    BackupRun,
    RestorePlan,
} from '../types/index.js';
import { appDataRoot } from '../codex/paths.js';
import {
    atomicWriteJson,
    copyFilePreservingLayout,
    ensureDir,
    pathExists,
    removeFileIfExists,
} from '../utils/fs.js';
import { makeRunId } from '../utils/time.js';

async function backupRoot(): Promise<string> {
    return path.join(await appDataRoot(), 'backups');
}

async function catalogPath(): Promise<string> {
    return path.join(await backupRoot(), 'catalog.json');
}

function toCatalogEntry(manifest: BackupManifest): BackupCatalogEntry {
    return {
        runId: manifest.runId,
        createdAt: manifest.createdAt,
        actionType: manifest.actionType,
        codexHome: manifest.codexHome,
        sessionCount: manifest.sessionIds.length,
        totalBytes: manifest.totalBytes,
        label: `${manifest.actionType} (${manifest.sessionIds.length} sessions)`,
    };
}

async function writeCatalog(entries: BackupCatalogEntry[]): Promise<void> {
    await ensureDir(await backupRoot());
    await atomicWriteJson(
        await catalogPath(),
        entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    );
}

export async function readCatalog(): Promise<BackupCatalogEntry[]> {
    const filePath = await catalogPath();
    try {
        return JSON.parse(await fs.readFile(filePath, 'utf8')) as BackupCatalogEntry[];
    } catch {
        return rebuildCatalog();
    }
}

export async function rebuildCatalog(): Promise<BackupCatalogEntry[]> {
    const root = await backupRoot();
    await ensureDir(root);
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
    const catalog: BackupCatalogEntry[] = [];
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const manifestPath = path.join(root, entry.name, 'manifest.json');
        try {
            const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as BackupManifest;
            catalog.push(toCatalogEntry(manifest));
        } catch {
            continue;
        }
    }
    await writeCatalog(catalog);
    return catalog;
}

export async function createBackupRun(input: {
    actionType: BackupActionType;
    codexHome: string;
    sessionIds: string[];
    sourcePaths: Array<{ sourcePath: string; kind: BackupManifestItem['kind'] }>;
    notes?: string;
}): Promise<BackupRun> {
    const root = await backupRoot();
    await ensureDir(root);
    const runId = makeRunId();
    const runRoot = path.join(root, runId);
    await ensureDir(runRoot);

    const items: BackupManifestItem[] = [];
    let totalBytes = 0;
    for (const source of input.sourcePaths) {
        if (!(await pathExists(source.sourcePath))) continue;
        const backupPath = await copyFilePreservingLayout(
            source.sourcePath,
            path.join(runRoot, 'files')
        );
        const stat = await fs.stat(source.sourcePath);
        totalBytes += stat.size;
        items.push({ sourcePath: source.sourcePath, backupPath, kind: source.kind });
    }

    const manifest: BackupManifest = {
        runId,
        createdAt: new Date().toISOString(),
        actionType: input.actionType,
        codexHome: input.codexHome,
        notes: input.notes,
        items,
        sessionIds: input.sessionIds,
        totalBytes,
    };

    await atomicWriteJson(path.join(runRoot, 'manifest.json'), manifest);
    const catalog = await readCatalog();
    catalog.unshift(toCatalogEntry(manifest));
    await writeCatalog(catalog);

    return { root: runRoot, manifest };
}

export async function listBackupRuns(): Promise<BackupRun[]> {
    const root = await backupRoot();
    await ensureDir(root);
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
    const runs: BackupRun[] = [];
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const manifestPath = path.join(root, entry.name, 'manifest.json');
        try {
            const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as BackupManifest;
            runs.push({ root: path.join(root, entry.name), manifest });
        } catch {
            continue;
        }
    }
    return runs.sort((a, b) => b.manifest.createdAt.localeCompare(a.manifest.createdAt));
}

export async function restoreBackup(plan: RestorePlan): Promise<number> {
    const runs = await listBackupRuns();
    const run = runs.find((item) => item.manifest.runId === plan.runId);
    if (!run) throw new Error(`Backup run not found: ${plan.runId}`);

    const items = plan.restoreAll
        ? run.manifest.items
        : run.manifest.items.filter((item) =>
              plan.items.some((selected) => selected.backupPath === item.backupPath)
          );
    for (const item of items) {
        await ensureDir(path.dirname(item.sourcePath));
        await fs.copyFile(item.backupPath, item.sourcePath);
    }
    return items.length;
}

export async function pruneBackups(options: {
    olderThanDays?: number;
    keepLatest?: number;
    runIds?: string[];
}): Promise<number> {
    const runs = await listBackupRuns();
    const selected = new Set(options.runIds ?? []);
    const now = Date.now();
    const doomed = runs.filter((run, index) => {
        if (selected.size > 0) return selected.has(run.manifest.runId);
        if (options.keepLatest && index < options.keepLatest) return false;
        if (options.olderThanDays) {
            const age = now - new Date(run.manifest.createdAt).getTime();
            return age > options.olderThanDays * 86_400_000;
        }
        return false;
    });

    for (const run of doomed) {
        await fs.rm(run.root, { recursive: true, force: true });
    }

    await writeCatalog((await listBackupRuns()).map((run) => toCatalogEntry(run.manifest)));
    return doomed.length;
}

export async function removeBrokenCatalog(): Promise<void> {
    await removeFileIfExists(await catalogPath());
}
