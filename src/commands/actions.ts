import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { DeletePlan, SessionRecord } from '../types/index.js';
import { createBackupRun } from '../backups/manager.js';
import { atomicWriteText, readJsonLines } from '../utils/fs.js';

export async function executeDeletePlan(
    codexHome: string,
    plan: DeletePlan
): Promise<{ deleted: number; backupRunId: string }> {
    const backup = await createBackupRun({
        actionType: 'delete-sessions',
        codexHome,
        sessionIds: plan.sessionIds,
        sourcePaths: [
            ...plan.deletePaths.map((sourcePath) => ({
                sourcePath,
                kind: sourcePath.includes('archived_sessions')
                    ? ('archived' as const)
                    : ('session' as const),
            })),
            { sourcePath: path.join(codexHome, 'session_index.jsonl'), kind: 'index' as const },
            { sourcePath: path.join(codexHome, 'history.jsonl'), kind: 'history' as const },
        ],
    });

    for (const target of plan.deletePaths) {
        await fs.rm(target, { force: true });
    }

    await rewriteIndexesAtomic(codexHome, new Set(plan.sessionIds));
    return { deleted: plan.deletePaths.length, backupRunId: backup.manifest.runId };
}

export async function cleanupStaleIndexes(
    codexHome: string,
    sessionIds: string[]
): Promise<string> {
    const backup = await createBackupRun({
        actionType: 'cleanup-stale',
        codexHome,
        sessionIds,
        sourcePaths: [
            { sourcePath: path.join(codexHome, 'session_index.jsonl'), kind: 'index' },
            { sourcePath: path.join(codexHome, 'history.jsonl'), kind: 'history' },
        ],
    });
    await rewriteIndexesAtomic(codexHome, new Set(sessionIds));
    return backup.manifest.runId;
}

export async function pruneArchived(
    codexHome: string,
    records: SessionRecord[]
): Promise<{ deleted: number; backupRunId: string }> {
    const archivePaths = [...new Set(records.flatMap((record) => record.absolutePaths))];
    const backup = await createBackupRun({
        actionType: 'prune-archived',
        codexHome,
        sessionIds: records.map((record) => record.id),
        sourcePaths: [
            ...archivePaths.map((sourcePath) => ({ sourcePath, kind: 'archived' as const })),
            { sourcePath: path.join(codexHome, 'session_index.jsonl'), kind: 'index' as const },
            { sourcePath: path.join(codexHome, 'history.jsonl'), kind: 'history' as const },
        ],
    });
    for (const target of archivePaths) {
        await fs.rm(target, { force: true });
    }
    await rewriteIndexesAtomic(codexHome, new Set(records.map((record) => record.id)));
    return { deleted: archivePaths.length, backupRunId: backup.manifest.runId };
}

async function rewriteIndexesAtomic(codexHome: string, removedIds: Set<string>): Promise<void> {
    const sessionIndexPath = path.join(codexHome, 'session_index.jsonl');
    const historyPath = path.join(codexHome, 'history.jsonl');
    const sessionIndexRows = await readJsonLines<Record<string, unknown>>(sessionIndexPath);
    const historyRows = await readJsonLines<Record<string, unknown>>(historyPath);
    const nextSessionIndex = sessionIndexRows.filter(
        (row) => !removedIds.has(String(row.id ?? ''))
    );
    const nextHistory = historyRows.filter((row) => !removedIds.has(String(row.session_id ?? '')));
    await atomicWriteText(
        sessionIndexPath,
        nextSessionIndex
            .map((row) => JSON.stringify(row))
            .join('\n')
            .concat(nextSessionIndex.length ? '\n' : '')
    );
    await atomicWriteText(
        historyPath,
        nextHistory
            .map((row) => JSON.stringify(row))
            .join('\n')
            .concat(nextHistory.length ? '\n' : '')
    );
}
