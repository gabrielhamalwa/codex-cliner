import { appDataRoot, hasWorktrees } from './paths.js';
import { readCatalog } from '../backups/manager.js';
import { scanInventory } from '../inventory/scan.js';
import type { DoctorReport } from '../types/index.js';

export async function buildDoctorReport(codexHome: string): Promise<DoctorReport> {
    const inventory = await scanInventory(codexHome);
    const catalog = await readCatalog();
    return {
        codexHome,
        appDataRoot: await appDataRoot(),
        activeSessionCount: inventory.activeSessions.length,
        archivedSessionCount: inventory.archivedSessions.length,
        staleRecordCount: inventory.staleIndexRecords.length,
        backupRunCount: catalog.length,
        totalActiveBytes: inventory.activeSessions.reduce((sum, item) => sum + item.size, 0),
        totalArchivedBytes: inventory.archivedSessions.reduce((sum, item) => sum + item.size, 0),
        hasWorktrees: await hasWorktrees(codexHome),
    };
}
