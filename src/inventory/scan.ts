import path from 'node:path';
import { promises as fs } from 'node:fs';
import fg from 'fast-glob';
import type {
    HistoryRecord,
    InventorySnapshot,
    ProjectConfidence,
    ProjectGroup,
    SessionFileMeta,
    SessionIndexRecord,
    SessionRecord,
} from '../types/index.js';
import { readJsonLines } from '../utils/fs.js';
import { toIsoString } from '../utils/time.js';

interface SessionMetaLine {
    type?: string;
    payload?: {
        id?: string;
        cwd?: string;
        originator?: string;
        timestamp?: string;
    };
}

const PROJECT_MARKERS = [
    '.git',
    'package.json',
    'bun.lock',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'yarn.lock',
    'turbo.json',
    'tsconfig.json',
    'pyproject.toml',
    'Cargo.toml',
    'go.mod',
];

export async function parseSessionIndex(
    codexHome: string
): Promise<Map<string, SessionIndexRecord>> {
    const rows = await readJsonLines<SessionIndexRecord>(
        path.join(codexHome, 'session_index.jsonl')
    );
    const map = new Map<string, SessionIndexRecord>();
    for (const row of rows) {
        if (!row.id) continue;
        const current = map.get(row.id);
        if (!current) {
            map.set(row.id, row);
            continue;
        }
        const nextTime = new Date(row.updated_at ?? 0).getTime();
        const currentTime = new Date(current.updated_at ?? 0).getTime();
        if (Number.isNaN(currentTime) || nextTime >= currentTime) {
            map.set(row.id, row);
        }
    }
    return map;
}

export async function parseHistory(codexHome: string): Promise<Map<string, string[]>> {
    const rows = await readJsonLines<HistoryRecord>(path.join(codexHome, 'history.jsonl'));
    const map = new Map<string, string[]>();
    for (const row of rows) {
        if (!row.session_id || !row.text?.trim()) continue;
        const list = map.get(row.session_id) ?? [];
        if (list.length < 3) list.push(row.text.trim());
        map.set(row.session_id, list);
    }
    return map;
}

export async function scanSessionFiles(
    rootDir: string,
    kind: 'active' | 'archived'
): Promise<SessionFileMeta[]> {
    const patterns = kind === 'active' ? ['**/*.jsonl'] : ['*.jsonl'];
    const cwd =
        kind === 'active'
            ? path.join(rootDir, 'sessions')
            : path.join(rootDir, 'archived_sessions');
    try {
        const matches = await fg(patterns, { cwd, absolute: true, onlyFiles: true, dot: false });
        const output: SessionFileMeta[] = [];
        for (const absolutePath of matches) {
            const stat = await fs.stat(absolutePath);
            const meta = await readSessionFileMeta(absolutePath, rootDir);
            output.push({
                ...meta,
                absolutePath,
                size: stat.size,
                updatedAt: toIsoString(stat.mtimeMs),
            });
        }
        return output.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
    } catch {
        return [];
    }
}

async function readSessionFileMeta(
    absolutePath: string,
    codexHome: string
): Promise<Omit<SessionFileMeta, 'absolutePath' | 'size' | 'updatedAt'>> {
    const relativePath = path.relative(codexHome, absolutePath);
    const fileName = path.basename(absolutePath);
    const idMatch = fileName.match(/([0-9a-f]{8}-[0-9a-f-]{27,})\.jsonl$/i);
    const fallbackId = fileName.replace(/\.jsonl$/i, '');
    const firstLines = (await fs.readFile(absolutePath, 'utf8')).split(/\r?\n/).slice(0, 50);
    let cwd: string | undefined;
    let originator: string | undefined;
    let id = idMatch?.[1] ?? fallbackId;
    for (const line of firstLines) {
        if (!line.trim()) continue;
        try {
            const parsed = JSON.parse(line) as SessionMetaLine;
            if (parsed.type === 'session_meta' && parsed.payload) {
                id = parsed.payload.id ?? id;
                cwd = parsed.payload.cwd ?? findNestedCwd(parsed);
                originator = parsed.payload.originator;
                break;
            }
            cwd ??= findNestedCwd(parsed);
        } catch {
            continue;
        }
    }
    return { id, relativePath, cwd, originator };
}

function findNestedCwd(value: unknown): string | undefined {
    if (!value || typeof value !== 'object') return undefined;
    if (Array.isArray(value)) {
        for (const item of value) {
            const nested = findNestedCwd(item);
            if (nested) return nested;
        }
        return undefined;
    }

    const record = value as Record<string, unknown>;
    const direct = record.cwd;
    if (typeof direct === 'string' && direct.startsWith('/')) return direct;

    for (const nested of Object.values(record)) {
        const result = findNestedCwd(nested);
        if (result) return result;
    }
    return undefined;
}

async function inferProject(
    meta: SessionFileMeta,
    projectRootCache: Map<string, { name?: string; path?: string; confidence?: ProjectConfidence }>
): Promise<{ name?: string; path?: string; confidence?: ProjectConfidence }> {
    if (!meta.cwd) return {};
    const normalized = path.resolve(meta.cwd);
    const cached = projectRootCache.get(normalized);
    if (cached) return cached;

    const root = await findProjectRoot(normalized);
    const inferred = root
        ? {
              name: path.basename(root.path),
              path: root.path,
              confidence: root.confidence,
          }
        : {
              name: path.basename(normalized),
              path: normalized,
              confidence: 'low' as ProjectConfidence,
          };
    projectRootCache.set(normalized, inferred);
    return inferred;
}

async function findProjectRoot(
    startDir: string
): Promise<{ path: string; confidence: ProjectConfidence } | undefined> {
    let current = startDir;
    let fallbackMarker: string | undefined;

    while (true) {
        for (const marker of PROJECT_MARKERS) {
            try {
                await fs.access(path.join(current, marker));
                if (marker === '.git') {
                    return { path: current, confidence: 'high' };
                }
                fallbackMarker ??= current;
            } catch {
                continue;
            }
        }

        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
    }

    if (fallbackMarker) {
        return { path: fallbackMarker, confidence: 'medium' };
    }
    return undefined;
}

async function toSessionRecord(
    meta: SessionFileMeta,
    kind: 'active' | 'archived',
    sessionIndex: Map<string, SessionIndexRecord>,
    history: Map<string, string[]>,
    projectRootCache: Map<string, { name?: string; path?: string; confidence?: ProjectConfidence }>
): Promise<SessionRecord> {
    const indexRow = sessionIndex.get(meta.id);
    const project = await inferProject(meta, projectRootCache);
    return {
        id: meta.id,
        kind,
        title: indexRow?.thread_name,
        updatedAt: indexRow?.updated_at ?? meta.updatedAt,
        absolutePath: meta.absolutePath,
        absolutePaths: [meta.absolutePath],
        relativePath: meta.relativePath,
        size: meta.size,
        projectName: project.name,
        projectPath: project.path,
        projectConfidence: project.confidence,
        historyPreview: history.get(meta.id) ?? [],
        stale: false,
        deletable: true,
        duplicateCount: 1,
    };
}

function collapseDuplicateRecords(records: SessionRecord[]): SessionRecord[] {
    const grouped = new Map<string, SessionRecord>();
    for (const record of records) {
        const current = grouped.get(record.id);
        if (!current) {
            grouped.set(record.id, record);
            continue;
        }

        const currentTime = new Date(current.updatedAt ?? 0).getTime();
        const nextTime = new Date(record.updatedAt ?? 0).getTime();
        const preferred = nextTime > currentTime ? record : current;
        const other = preferred === record ? current : record;

        grouped.set(record.id, {
            ...preferred,
            size: preferred.size + other.size,
            absolutePaths: [...new Set([...preferred.absolutePaths, ...other.absolutePaths])],
            duplicateCount: preferred.duplicateCount + other.duplicateCount,
            absolutePath: preferred.absolutePath ?? other.absolutePath,
            historyPreview:
                preferred.historyPreview.length > 0
                    ? preferred.historyPreview
                    : other.historyPreview,
            projectName: preferred.projectName ?? other.projectName,
            projectPath: preferred.projectPath ?? other.projectPath,
            projectConfidence: preferred.projectConfidence ?? other.projectConfidence,
        });
    }
    return [...grouped.values()].sort((a, b) =>
        (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
    );
}

function buildStaleRecords(
    sessionIndex: Map<string, SessionIndexRecord>,
    history: Map<string, string[]>,
    seenIds: Set<string>
): SessionRecord[] {
    const rows: SessionRecord[] = [];
    for (const [id, record] of sessionIndex.entries()) {
        if (seenIds.has(id)) continue;
        rows.push({
            id,
            kind: 'stale-index',
            title: record.thread_name,
            updatedAt: record.updated_at,
            absolutePaths: [],
            relativePath: 'sessions/<missing>',
            size: 0,
            historyPreview: history.get(id) ?? [],
            stale: true,
            deletable: false,
            duplicateCount: 1,
        });
    }
    return rows.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
}

function buildProjectGroups(records: SessionRecord[]): ProjectGroup[] {
    const groups = new Map<string, ProjectGroup>();
    for (const record of records) {
        const key = record.projectPath ?? record.projectName ?? 'unknown';
        const current = groups.get(key) ?? {
            name: record.projectName ?? 'unknown',
            path: record.projectPath,
            confidence: record.projectConfidence ?? 'low',
            sessionIds: [],
            sessionCount: 0,
            archivedCount: 0,
            totalBytes: 0,
        };
        current.sessionIds.push(record.id);
        current.totalBytes += record.size;
        if (record.kind === 'archived') current.archivedCount += 1;
        else current.sessionCount += 1;
        groups.set(key, current);
    }
    return [...groups.values()].sort((a, b) => b.totalBytes - a.totalBytes);
}

export async function scanInventory(codexHome: string): Promise<InventorySnapshot> {
    const sessionIndex = await parseSessionIndex(codexHome);
    const history = await parseHistory(codexHome);
    const activeMeta = await scanSessionFiles(codexHome, 'active');
    const archivedMeta = await scanSessionFiles(codexHome, 'archived');

    const projectRootCache = new Map<
        string,
        { name?: string; path?: string; confidence?: ProjectConfidence }
    >();
    const activeSessions = collapseDuplicateRecords(
        await Promise.all(
            activeMeta.map((meta) =>
                toSessionRecord(meta, 'active', sessionIndex, history, projectRootCache)
            )
        )
    );
    const archivedSessions = collapseDuplicateRecords(
        await Promise.all(
            archivedMeta.map((meta) =>
                toSessionRecord(meta, 'archived', sessionIndex, history, projectRootCache)
            )
        )
    );
    const seenIds = new Set([...activeSessions, ...archivedSessions].map((item) => item.id));
    const staleIndexRecords = buildStaleRecords(sessionIndex, history, seenIds);
    const projectGroups = buildProjectGroups([...activeSessions, ...archivedSessions]);

    return {
        codexHome,
        activeSessions,
        archivedSessions,
        staleIndexRecords,
        projectGroups,
        sessionIndexCount: sessionIndex.size,
        historyCount: [...history.values()].reduce((sum, items) => sum + items.length, 0),
    };
}
