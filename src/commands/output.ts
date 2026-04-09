import chalk from 'chalk';
import type { BackupRun, DoctorReport, InventorySnapshot, SessionRecord } from '../types/index.js';
import { formatBytes } from '../utils/bytes.js';
import { relativeTime } from '../utils/time.js';

export function printInventory(snapshot: InventorySnapshot): void {
    console.log(chalk.bold(`Codex home: ${snapshot.codexHome}`));
    console.log(`Active sessions: ${snapshot.activeSessions.length}`);
    console.log(`Archived sessions: ${snapshot.archivedSessions.length}`);
    console.log(`Stale index records: ${snapshot.staleIndexRecords.length}`);
    console.log('');
    printRecords('Active', snapshot.activeSessions.slice(0, 20));
    printRecords('Archived', snapshot.archivedSessions.slice(0, 20));
    printRecords('Stale', snapshot.staleIndexRecords.slice(0, 20));
}

function printRecords(label: string, records: SessionRecord[]): void {
    console.log(chalk.cyan(label));
    if (records.length === 0) {
        console.log('  none');
        return;
    }
    for (const record of records) {
        console.log(
            `  ${record.id.slice(0, 8)}  ${record.title ?? 'Untitled'}  ${formatBytes(record.size)}  ${relativeTime(record.updatedAt)}`
        );
    }
}

export function printDoctor(report: DoctorReport): void {
    console.log(chalk.bold('Doctor'));
    console.log(`Codex home: ${report.codexHome}`);
    console.log(`App data root: ${report.appDataRoot}`);
    console.log(`Active sessions: ${report.activeSessionCount}`);
    console.log(`Archived sessions: ${report.archivedSessionCount}`);
    console.log(`Stale records: ${report.staleRecordCount}`);
    console.log(`Backup runs: ${report.backupRunCount}`);
    console.log(`Active bytes: ${formatBytes(report.totalActiveBytes)}`);
    console.log(`Archived bytes: ${formatBytes(report.totalArchivedBytes)}`);
    console.log(`Has worktrees: ${report.hasWorktrees ? 'yes' : 'no'}`);
}

export function printBackups(runs: BackupRun[]): void {
    console.log(chalk.bold('Backup runs'));
    if (runs.length === 0) {
        console.log('No backups found.');
        return;
    }
    for (const run of runs) {
        console.log(
            `${run.manifest.runId}  ${run.manifest.actionType}  ${run.manifest.sessionIds.length} sessions  ${formatBytes(run.manifest.totalBytes)}`
        );
    }
}
