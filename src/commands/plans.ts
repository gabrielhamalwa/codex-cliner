import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { DeletePlan, InventorySnapshot, SessionRecord } from '../types/index.js';
import { readJsonLines } from '../utils/fs.js';
import { formatBytes } from '../utils/bytes.js';

export function buildDeletePlan(records: SessionRecord[]): DeletePlan {
    const deletable = records.filter((record) => record.absolutePath);
    return {
        sessionIds: deletable.map((record) => record.id),
        deletePaths: [...new Set(deletable.flatMap((record) => record.absolutePaths))],
        removeSessionIndexIds: records.map((record) => record.id),
        removeHistoryIds: records.map((record) => record.id),
        estimatedBytes: deletable.reduce((sum, record) => sum + record.size, 0),
    };
}

export function describeDeletePlan(plan: DeletePlan): string {
    return `${plan.sessionIds.length} sessions, ${formatBytes(plan.estimatedBytes)}, ${plan.removeSessionIndexIds.length} index ids`;
}

export async function rewriteIndexes(codexHome: string, removedIds: Set<string>): Promise<void> {
    const sessionIndexPath = path.join(codexHome, 'session_index.jsonl');
    const historyPath = path.join(codexHome, 'history.jsonl');
    const sessionIndexRows = await readJsonLines<Record<string, unknown>>(sessionIndexPath);
    const historyRows = await readJsonLines<Record<string, unknown>>(historyPath);

    const nextSessionIndex = sessionIndexRows.filter(
        (row) => !removedIds.has(String(row.id ?? ''))
    );
    const nextHistory = historyRows.filter((row) => !removedIds.has(String(row.session_id ?? '')));

    await fs.writeFile(
        sessionIndexPath,
        nextSessionIndex
            .map((row) => JSON.stringify(row))
            .join('\n')
            .concat(nextSessionIndex.length ? '\n' : ''),
        'utf8'
    );
    await fs.writeFile(
        historyPath,
        nextHistory
            .map((row) => JSON.stringify(row))
            .join('\n')
            .concat(nextHistory.length ? '\n' : ''),
        'utf8'
    );
}

export function findProjectRecords(
    snapshot: InventorySnapshot,
    projectKey: string
): SessionRecord[] {
    return [...snapshot.activeSessions, ...snapshot.archivedSessions].filter(
        (record) => record.projectPath === projectKey || record.projectName === projectKey
    );
}
