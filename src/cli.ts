#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { Command } from 'commander';
import { ensureCodexHome } from './codex/paths.js';
import { scanInventory } from './inventory/scan.js';
import { printBackups, printDoctor, printInventory } from './commands/output.js';
import { buildDoctorReport } from './codex/doctor.js';
import { App } from './ui/App.js';
import { listBackupRuns, restoreBackup } from './backups/manager.js';
import { cleanupStaleIndexes, executeDeletePlan, pruneArchived } from './commands/actions.js';
import { buildDeletePlan, findProjectRecords } from './commands/plans.js';
import { getAppConfigPath, readAppConfig, resetAppConfig } from './config/store.js';

const program = new Command();

program
    .name('codex-cliner')
    .description('Backup-first local Codex cleanup and recovery manager.')
    .option('--codex-home <path>', 'override Codex home');

program
    .command('scan')
    .description('Scan and print the current Codex inventory')
    .action(async () => {
        const codexHome = await ensureCodexHome(program.opts<{ codexHome?: string }>().codexHome);
        printInventory(await scanInventory(codexHome));
    });

program
    .command('doctor')
    .description('Print a storage and backup health summary')
    .action(async () => {
        const codexHome = await ensureCodexHome(program.opts<{ codexHome?: string }>().codexHome);
        printDoctor(await buildDoctorReport(codexHome));
    });

program
    .command('backups')
    .description('List backup runs')
    .action(async () => {
        printBackups(await listBackupRuns());
    });

program
    .command('restore')
    .description('Restore a backup run')
    .requiredOption('--run-id <id>', 'backup run id')
    .option(
        '--source-path <path...>',
        'restore only the selected original source paths from the run'
    )
    .action(async (options: { runId: string; sourcePath?: string[] }) => {
        const runs = await listBackupRuns();
        const run = runs.find((item) => item.manifest.runId === options.runId);
        if (!run) {
            console.error(`Backup run not found: ${options.runId}`);
            process.exitCode = 1;
            return;
        }
        const items = options.sourcePath
            ? run.manifest.items.filter((item) => options.sourcePath?.includes(item.sourcePath))
            : [];
        const restored = await restoreBackup({
            runId: options.runId,
            restoreAll: !options.sourcePath || options.sourcePath.length === 0,
            items,
        });
        console.log(`Restored ${restored} files from ${options.runId}`);
    });

program
    .command('cleanup-stale')
    .description('Remove stale session_index/history entries')
    .action(async () => {
        const codexHome = await ensureCodexHome(program.opts<{ codexHome?: string }>().codexHome);
        const snapshot = await scanInventory(codexHome);
        const backupRunId = await cleanupStaleIndexes(
            codexHome,
            snapshot.staleIndexRecords.map((record) => record.id)
        );
        console.log(
            `Cleaned ${snapshot.staleIndexRecords.length} stale records. Backup ${backupRunId}`
        );
    });

program
    .command('prune-archived')
    .description('Prune archived sessions older than the given number of days')
    .requiredOption('--older-than <days>', 'days threshold')
    .action(async (options: { olderThan: string }) => {
        const codexHome = await ensureCodexHome(program.opts<{ codexHome?: string }>().codexHome);
        const snapshot = await scanInventory(codexHome);
        const cutoff = Date.now() - Number(options.olderThan) * 86_400_000;
        const targets = snapshot.archivedSessions.filter(
            (record) => new Date(record.updatedAt ?? 0).getTime() < cutoff
        );
        const result = await pruneArchived(codexHome, targets);
        console.log(`Pruned ${result.deleted} archived sessions. Backup ${result.backupRunId}`);
    });

program
    .command('delete')
    .description('Delete one session id or one inferred project')
    .option('--session <id>', 'session id to delete')
    .option('--project <key>', 'project path or project name to delete')
    .action(async (options: { session?: string; project?: string }) => {
        const codexHome = await ensureCodexHome(program.opts<{ codexHome?: string }>().codexHome);
        const snapshot = await scanInventory(codexHome);
        const records = options.session
            ? [...snapshot.activeSessions, ...snapshot.archivedSessions].filter(
                  (record) => record.id === options.session
              )
            : options.project
              ? findProjectRecords(snapshot, options.project)
              : [];

        if (records.length === 0) {
            console.error('Nothing matched the requested delete target.');
            process.exitCode = 1;
            return;
        }

        const result = await executeDeletePlan(codexHome, buildDeletePlan(records));
        console.log(`Deleted ${result.deleted} files. Backup ${result.backupRunId}`);
    });

const configCommand = program
    .command('config')
    .description('Inspect or reset app-owned codex-cliner configuration');

configCommand
    .command('show')
    .description('Show the saved codex-cliner configuration')
    .action(async () => {
        const config = await readAppConfig();
        console.log(`Config path: ${await getAppConfigPath()}`);
        console.log(`Last Codex home: ${config.lastCodexHome ?? 'none'}`);
        console.log('Recent Codex homes:');
        if (config.recentCodexHomes.length === 0) {
            console.log('  none');
            return;
        }
        for (const item of config.recentCodexHomes) {
            console.log(`  ${item}`);
        }
    });

configCommand
    .command('reset')
    .description('Clear the saved codex-cliner configuration')
    .action(async () => {
        await resetAppConfig();
        console.log('Saved codex-cliner configuration cleared.');
    });

program.action(async () => {
    const options = program.opts<{ codexHome?: string }>();
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        await printInteractiveFallback(options.codexHome);
        return;
    }
    render(React.createElement(App, { initialCodexHome: options.codexHome }));
});

await program.parseAsync(process.argv);

async function printInteractiveFallback(codexHomeOverride?: string): Promise<void> {
    console.error(
        'Interactive mode requires a real TTY. Falling back to a non-interactive summary.'
    );
    try {
        const codexHome = await ensureCodexHome(codexHomeOverride);
        printDoctor(await buildDoctorReport(codexHome));
        console.error('');
        console.error('Use one of these non-interactive commands instead:');
        console.error('  codex-cliner scan --codex-home <path>');
        console.error('  codex-cliner doctor --codex-home <path>');
        console.error('  codex-cliner backups');
    } catch (error) {
        console.error(error instanceof Error ? error.message : 'No valid Codex home found.');
        process.exitCode = 1;
    }
}
