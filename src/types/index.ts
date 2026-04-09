export type SessionKind = 'active' | 'archived' | 'stale-index';
export type ProjectConfidence = 'high' | 'medium' | 'low';
export type BackupActionType = 'delete-sessions' | 'prune-archived' | 'cleanup-stale' | 'restore';

export interface SessionIndexRecord {
    id: string;
    thread_name?: string;
    updated_at?: string;
}

export interface HistoryRecord {
    session_id: string;
    ts?: number;
    text: string;
}

export interface SessionFileMeta {
    id: string;
    absolutePath: string;
    relativePath: string;
    size: number;
    updatedAt?: string;
    cwd?: string;
    originator?: string;
}

export interface SessionRecord {
    id: string;
    kind: SessionKind;
    title?: string;
    updatedAt?: string;
    absolutePath?: string;
    absolutePaths: string[];
    relativePath: string;
    size: number;
    projectName?: string;
    projectPath?: string;
    projectConfidence?: ProjectConfidence;
    historyPreview: string[];
    stale: boolean;
    deletable: boolean;
    duplicateCount: number;
}

export interface ProjectGroup {
    name: string;
    path?: string;
    confidence: ProjectConfidence;
    sessionIds: string[];
    sessionCount: number;
    archivedCount: number;
    totalBytes: number;
}

export interface InventorySnapshot {
    codexHome: string;
    activeSessions: SessionRecord[];
    archivedSessions: SessionRecord[];
    staleIndexRecords: SessionRecord[];
    projectGroups: ProjectGroup[];
    sessionIndexCount: number;
    historyCount: number;
}

export interface DeletePlan {
    sessionIds: string[];
    deletePaths: string[];
    removeSessionIndexIds: string[];
    removeHistoryIds: string[];
    estimatedBytes: number;
}

export interface BackupManifestItem {
    sourcePath: string;
    backupPath: string;
    kind: 'session' | 'index' | 'history' | 'archived';
}

export interface BackupManifest {
    runId: string;
    createdAt: string;
    actionType: BackupActionType;
    codexHome: string;
    notes?: string;
    items: BackupManifestItem[];
    sessionIds: string[];
    totalBytes: number;
}

export interface BackupCatalogEntry {
    runId: string;
    createdAt: string;
    actionType: BackupActionType;
    codexHome: string;
    sessionCount: number;
    totalBytes: number;
    label: string;
}

export interface BackupRun {
    root: string;
    manifest: BackupManifest;
}

export interface RestorePlan {
    runId: string;
    restoreAll: boolean;
    items: BackupManifestItem[];
}

export interface DoctorReport {
    codexHome: string;
    appDataRoot: string;
    activeSessionCount: number;
    archivedSessionCount: number;
    staleRecordCount: number;
    backupRunCount: number;
    totalActiveBytes: number;
    totalArchivedBytes: number;
    hasWorktrees: boolean;
}
