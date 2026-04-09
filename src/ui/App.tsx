import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type {
    BackupManifestItem,
    BackupRun,
    InventorySnapshot,
    ProjectGroup,
    SessionRecord,
} from '../types/index.js';
import { scanInventory } from '../inventory/scan.js';
import { listBackupRuns, pruneBackups, restoreBackup } from '../backups/manager.js';
import { cleanupStaleIndexes, executeDeletePlan, pruneArchived } from '../commands/actions.js';
import { buildDeletePlan } from '../commands/plans.js';
import { detectCodexHomes, isValidCodexHome } from '../codex/paths.js';
import { readAppConfig, resolveSavedCodexHome, saveSelectedCodexHome } from '../config/store.js';
import { formatBytes } from '../utils/bytes.js';
import { relativeTime } from '../utils/time.js';
import { SelectableList } from './components/SelectableList.js';

const MAIN_MENU = [
    'Browse active sessions',
    'Browse archived sessions',
    'Browse stale indexes',
    'Browse projects',
    'Browse backups',
    'Diagnostics',
    'Help',
    'Rescan',
    'Change Codex home',
    'Exit',
] as const;

const CUSTOM_HOME_ID = '__custom_home__';

type MainMenuItem = (typeof MAIN_MENU)[number];
type View =
    | 'home-select'
    | 'menu'
    | 'active'
    | 'archived'
    | 'stale'
    | 'projects'
    | 'backups'
    | 'backup-detail'
    | 'diagnostics'
    | 'help';

type ConfirmAction =
    | { type: 'delete-active'; records: SessionRecord[] }
    | { type: 'prune-archived'; records: SessionRecord[] }
    | { type: 'cleanup-stale'; records: SessionRecord[] }
    | { type: 'delete-project'; project: ProjectGroup; records: SessionRecord[] }
    | { type: 'restore-backup'; run: BackupRun; items: BackupManifestItem[]; restoreAll: boolean };

export function App(props: { initialCodexHome?: string }): React.JSX.Element {
    const { exit } = useApp();
    const [codexHome, setCodexHome] = useState<string | null>(null);
    const [homeCandidates, setHomeCandidates] = useState<string[]>([]);
    const [homeCursor, setHomeCursor] = useState(0);
    const [customHomeMode, setCustomHomeMode] = useState(false);
    const [customHomeInput, setCustomHomeInput] = useState(props.initialCodexHome ?? '');
    const [homeError, setHomeError] = useState('');
    const [savedHome, setSavedHome] = useState<string | null>(null);
    const [recentHomes, setRecentHomes] = useState<string[]>([]);
    const [snapshot, setSnapshot] = useState<InventorySnapshot | null>(null);
    const [backupRuns, setBackupRuns] = useState<BackupRun[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [view, setView] = useState<View>('home-select');
    const [menuCursor, setMenuCursor] = useState(0);
    const [listCursor, setListCursor] = useState(0);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
    const [confirmInput, setConfirmInput] = useState('');
    const [filtering, setFiltering] = useState(false);
    const [filter, setFilter] = useState('');
    const [backupDetailRunId, setBackupDetailRunId] = useState<string | null>(null);
    const [backupItemCursor, setBackupItemCursor] = useState(0);
    const [selectedBackupItemPaths, setSelectedBackupItemPaths] = useState<Set<string>>(new Set());
    const [previousView, setPreviousView] = useState<View>('menu');

    useEffect(() => {
        void loadHomeCandidates(false);
    }, [props.initialCodexHome]);

    async function loadHomeCandidates(forcePicker: boolean): Promise<void> {
        setLoading(true);
        const config = await readAppConfig();
        const remembered = await resolveSavedCodexHome();
        setSavedHome(remembered ?? null);
        setRecentHomes(config.recentCodexHomes);
        if (!forcePicker && !props.initialCodexHome && remembered) {
            await reload(remembered);
            setView('menu');
            return;
        }

        const detected = await detectCodexHomes(props.initialCodexHome);
        const orderedCandidates = [
            ...new Set([
                ...(props.initialCodexHome ? [props.initialCodexHome] : []),
                ...(remembered ? [remembered] : []),
                ...config.recentCodexHomes,
                ...detected,
            ]),
        ];
        const validCandidates = [];
        for (const candidate of orderedCandidates) {
            if (await isValidCodexHome(candidate)) {
                validCandidates.push(candidate);
            }
        }

        setHomeCandidates(validCandidates);
        setHomeCursor(0);
        setCustomHomeMode(false);
        setHomeError('');
        setView('home-select');
        setCodexHome(null);
        setSnapshot(null);
        setBackupRuns([]);
        setLoading(false);
    }

    async function reload(targetHome = codexHome): Promise<void> {
        if (!targetHome) return;
        setLoading(true);
        const [nextSnapshot, nextBackupRuns] = await Promise.all([
            scanInventory(targetHome),
            listBackupRuns(),
        ]);
        setCodexHome(targetHome);
        setSnapshot(nextSnapshot);
        setBackupRuns(nextBackupRuns);
        setSelectedIds(new Set());
        setSelectedBackupItemPaths(new Set());
        setListCursor(0);
        setBackupItemCursor(0);
        setLoading(false);
    }

    const records = useMemo(() => {
        if (!snapshot) return [] as SessionRecord[];
        const base =
            view === 'active'
                ? snapshot.activeSessions
                : view === 'archived'
                  ? snapshot.archivedSessions
                  : view === 'stale'
                    ? snapshot.staleIndexRecords
                    : [];
        return base.filter((record) =>
            matchesFilter(
                [
                    record.id,
                    record.title,
                    record.projectName,
                    record.relativePath,
                    record.projectPath,
                ],
                filter
            )
        );
    }, [snapshot, view, filter]);

    const projects = useMemo(() => {
        if (!snapshot) return [] as ProjectGroup[];
        return snapshot.projectGroups.filter((project) =>
            matchesFilter([project.name, project.path], filter)
        );
    }, [snapshot, filter]);

    const filteredBackups = useMemo(
        () =>
            backupRuns.filter((run) =>
                matchesFilter(
                    [run.manifest.runId, run.manifest.actionType, run.manifest.notes],
                    filter
                )
            ),
        [backupRuns, filter]
    );

    const currentBackupRun =
        backupRuns.find((run) => run.manifest.runId === backupDetailRunId) ??
        filteredBackups[listCursor];

    const backupItems = useMemo(
        () =>
            (currentBackupRun?.manifest.items ?? []).filter((item) =>
                matchesFilter([item.sourcePath, item.kind], filter)
            ),
        [currentBackupRun, filter]
    );

    useInput((input, key) => {
        if (loading) return;

        if (view === 'home-select') {
            handleHomeSelectInput(input, key);
            return;
        }

        if (input === '?') {
            setPreviousView(view);
            setView('help');
            return;
        }
        if (input === 'h') {
            setPreviousView(view);
            setView('help');
            return;
        }

        if (filtering) {
            if (key.escape) setFiltering(false);
            return;
        }

        if (confirmAction) {
            if (key.escape) {
                setConfirmAction(null);
                setConfirmInput('');
                return;
            }
            if (key.return && confirmInput === 'DELETE') {
                void runConfirmAction();
            }
            return;
        }

        if (input === '/') {
            setFiltering(true);
            return;
        }

        if (input === 'q') {
            if (view === 'backup-detail') {
                setView('backups');
                setSelectedBackupItemPaths(new Set());
                setBackupItemCursor(0);
                return;
            }
            if (view === 'help') {
                setView(previousView);
                return;
            }
            if (view === 'menu') {
                exit();
            } else {
                setView('menu');
                setFilter('');
                setSelectedIds(new Set());
                setListCursor(0);
            }
            return;
        }

        if (view === 'menu') {
            if (key.upArrow) setMenuCursor((value) => Math.max(0, value - 1));
            if (key.downArrow) setMenuCursor((value) => Math.min(MAIN_MENU.length - 1, value + 1));
            if (key.return) handleMenuSelect(MAIN_MENU[menuCursor]);
            return;
        }

        if (view === 'help') {
            return;
        }

        if (view === 'backup-detail') {
            if (key.upArrow) setBackupItemCursor((value) => Math.max(0, value - 1));
            if (key.downArrow) {
                setBackupItemCursor((value) =>
                    Math.min(Math.max(0, backupItems.length - 1), value + 1)
                );
            }
            if (input === ' ') toggleBackupItemSelection();
            if (input === 'a')
                setSelectedBackupItemPaths(new Set(backupItems.map((item) => item.sourcePath)));
            if (input === 'A') setSelectedBackupItemPaths(new Set());
            if (input === 'r') openRestoreBackupSelection(false);
            if (input === 'R') openRestoreBackupSelection(true);
            if (input === 'p') void pruneCurrentBackupRun();
            return;
        }

        const currentLength =
            view === 'projects'
                ? projects.length
                : view === 'backups'
                  ? filteredBackups.length
                  : records.length;
        if (key.upArrow) setListCursor((value) => Math.max(0, value - 1));
        if (key.downArrow)
            setListCursor((value) => Math.min(Math.max(0, currentLength - 1), value + 1));
        if (input === ' ') toggleCurrentSelection();
        if (input === 'a') selectAllVisible();
        if (input === 'A') setSelectedIds(new Set());
        if (input === 'r') void reload();
        if (key.return && view === 'backups') openBackupDetail();
        if (view === 'active' && input === 'd') openDeleteActive();
        if (view === 'archived' && input === 'p') openPruneArchived();
        if (view === 'stale' && input === 'c') openCleanupStale();
        if (view === 'projects' && input === 'd') openDeleteProject();
        if (view === 'backups' && input === 'r') openRestoreBackup();
        if (view === 'backups' && input === 'p') void pruneLatestBackups();
    });

    function handleHomeSelectInput(
        input: string,
        key: { upArrow?: boolean; downArrow?: boolean; return?: boolean; escape?: boolean }
    ): void {
        if (customHomeMode) {
            if (input === 'h' || input === '?') {
                setPreviousView('home-select');
                setView('help');
                return;
            }
            if (input === 'q') {
                exit();
                return;
            }
            if (key.escape) {
                setCustomHomeMode(false);
                setHomeError('');
            }
            return;
        }

        const totalRows = homeCandidates.length + 1;
        if (input === 'q') {
            exit();
            return;
        }
        if (input === 'h' || input === '?') {
            setPreviousView('home-select');
            setView('help');
            return;
        }
        if (key.upArrow) setHomeCursor((value) => Math.max(0, value - 1));
        if (key.downArrow) setHomeCursor((value) => Math.min(totalRows - 1, value + 1));
        if (input === 'm') {
            setCustomHomeMode(true);
            setHomeError('');
            return;
        }
        if (key.return) {
            if (homeCursor === homeCandidates.length) {
                setCustomHomeMode(true);
                setHomeError('');
            } else {
                void confirmCodexHome(homeCandidates[homeCursor] ?? '');
            }
        }
    }

    async function confirmCodexHome(candidate: string): Promise<void> {
        const value = candidate.trim();
        if (!value) {
            setHomeError('Enter a Codex home path.');
            return;
        }

        setLoading(true);
        const valid = await isValidCodexHome(value);
        if (!valid) {
            setLoading(false);
            setHomeError(`Not a valid Codex home: ${value}`);
            return;
        }

        setHomeError('');
        setCustomHomeMode(false);
        await saveSelectedCodexHome(value);
        setSavedHome(value);
        setRecentHomes((current) =>
            [value, ...current.filter((item) => item !== value)].slice(0, 5)
        );
        await reload(value);
        setView('menu');
    }

    async function runConfirmAction(): Promise<void> {
        if (!confirmAction || !codexHome) return;
        setLoading(true);
        try {
            if (confirmAction.type === 'delete-active' || confirmAction.type === 'delete-project') {
                const plan = buildDeletePlan(confirmAction.records);
                const result = await executeDeletePlan(codexHome, plan);
                setMessage(`Deleted ${result.deleted} files. Backup ${result.backupRunId}`);
            } else if (confirmAction.type === 'prune-archived') {
                const result = await pruneArchived(codexHome, confirmAction.records);
                setMessage(`Pruned ${result.deleted} archived files. Backup ${result.backupRunId}`);
            } else if (confirmAction.type === 'cleanup-stale') {
                const backupRunId = await cleanupStaleIndexes(
                    codexHome,
                    confirmAction.records.map((record) => record.id)
                );
                setMessage(
                    `Cleaned ${confirmAction.records.length} stale records. Backup ${backupRunId}`
                );
            } else if (confirmAction.type === 'restore-backup') {
                const restored = await restoreBackup({
                    runId: confirmAction.run.manifest.runId,
                    restoreAll: confirmAction.restoreAll,
                    items: confirmAction.items,
                });
                setMessage(`Restored ${restored} files from ${confirmAction.run.manifest.runId}`);
            }
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Action failed');
        } finally {
            setConfirmAction(null);
            setConfirmInput('');
            await reload();
        }
    }

    function handleMenuSelect(item: MainMenuItem): void {
        if (item === 'Exit') {
            exit();
            return;
        }
        if (item === 'Rescan') {
            void reload();
            return;
        }
        if (item === 'Help') {
            setPreviousView('menu');
            setView('help');
            return;
        }
        if (item === 'Change Codex home') {
            void loadHomeCandidates(true);
            return;
        }

        setSelectedIds(new Set());
        setSelectedBackupItemPaths(new Set());
        setListCursor(0);
        setBackupItemCursor(0);
        setFilter('');
        setView(
            item === 'Browse active sessions'
                ? 'active'
                : item === 'Browse archived sessions'
                  ? 'archived'
                  : item === 'Browse stale indexes'
                    ? 'stale'
                    : item === 'Browse projects'
                      ? 'projects'
                      : item === 'Browse backups'
                        ? 'backups'
                        : 'diagnostics'
        );
    }

    function toggleCurrentSelection(): void {
        const currentId = getCurrentSelectableId();
        if (!currentId) return;
        const next = new Set(selectedIds);
        if (next.has(currentId)) next.delete(currentId);
        else next.add(currentId);
        setSelectedIds(next);
    }

    function toggleBackupItemSelection(): void {
        const currentPath = backupItems[backupItemCursor]?.sourcePath;
        if (!currentPath) return;
        const next = new Set(selectedBackupItemPaths);
        if (next.has(currentPath)) next.delete(currentPath);
        else next.add(currentPath);
        setSelectedBackupItemPaths(next);
    }

    function selectAllVisible(): void {
        const ids =
            view === 'projects'
                ? projects.map((project) => project.path ?? project.name)
                : view === 'backups'
                  ? filteredBackups.map((run) => run.manifest.runId)
                  : records
                        .filter((record) => record.deletable || record.stale)
                        .map((record) => record.id);
        setSelectedIds(new Set(ids));
    }

    function getCurrentSelectableId(): string | undefined {
        if (view === 'projects') {
            const project = projects[listCursor];
            return project ? (project.path ?? project.name) : undefined;
        }
        if (view === 'backups') {
            return filteredBackups[listCursor]?.manifest.runId;
        }
        return records[listCursor]?.id;
    }

    function openDeleteActive(): void {
        const targets = records.filter((record) => selectedIds.has(record.id));
        if (targets.length > 0) setConfirmAction({ type: 'delete-active', records: targets });
    }

    function openPruneArchived(): void {
        const targets = records.filter((record) => selectedIds.has(record.id));
        if (targets.length > 0) setConfirmAction({ type: 'prune-archived', records: targets });
    }

    function openCleanupStale(): void {
        const targets = records.filter(
            (record) => selectedIds.has(record.id) || selectedIds.size === 0
        );
        if (targets.length > 0) setConfirmAction({ type: 'cleanup-stale', records: targets });
    }

    function openDeleteProject(): void {
        const project = projects[listCursor];
        if (!project || !snapshot) return;
        const recordsForProject = [...snapshot.activeSessions, ...snapshot.archivedSessions].filter(
            (record) => project.sessionIds.includes(record.id)
        );
        if (recordsForProject.length > 0) {
            setConfirmAction({ type: 'delete-project', project, records: recordsForProject });
        }
    }

    function openRestoreBackup(): void {
        const run = filteredBackups[listCursor];
        if (run) setConfirmAction({ type: 'restore-backup', run, restoreAll: true, items: [] });
    }

    function openBackupDetail(): void {
        const run = filteredBackups[listCursor];
        if (!run) return;
        setBackupDetailRunId(run.manifest.runId);
        setSelectedBackupItemPaths(new Set());
        setBackupItemCursor(0);
        setView('backup-detail');
    }

    function openRestoreBackupSelection(restoreAll: boolean): void {
        const run = currentBackupRun;
        if (!run) return;
        const currentItem = backupItems[backupItemCursor];
        const selectedItems = run.manifest.items.filter((item) =>
            selectedBackupItemPaths.has(item.sourcePath)
        );
        const items = restoreAll
            ? []
            : selectedItems.length > 0
              ? selectedItems
              : currentItem
                ? [currentItem]
                : [];
        if (!restoreAll && items.length === 0) return;
        setConfirmAction({ type: 'restore-backup', run, restoreAll, items });
    }

    async function pruneCurrentBackupRun(): Promise<void> {
        if (!currentBackupRun) return;
        setLoading(true);
        try {
            const deleted = await pruneBackups({ runIds: [currentBackupRun.manifest.runId] });
            setMessage(`Pruned ${deleted} backup run.`);
            setView('backups');
            setBackupDetailRunId(null);
            setSelectedBackupItemPaths(new Set());
            setBackupItemCursor(0);
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Backup prune failed');
        } finally {
            await reload();
        }
    }

    async function pruneLatestBackups(): Promise<void> {
        setLoading(true);
        try {
            const selectedRunIds = filteredBackups
                .filter((run) => selectedIds.has(run.manifest.runId))
                .map((run) => run.manifest.runId);
            const deleted = await pruneBackups(
                selectedRunIds.length > 0
                    ? { runIds: selectedRunIds }
                    : { keepLatest: 10, olderThanDays: 30 }
            );
            setMessage(`Pruned ${deleted} backup runs.`);
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Backup prune failed');
        } finally {
            await reload();
        }
    }

    if (loading) {
        return (
            <Text color="cyan">
                {view === 'home-select'
                    ? 'Detecting Codex homes...'
                    : 'Scanning Codex inventory...'}
            </Text>
        );
    }

    if (view === 'home-select') {
        const rows = [
            ...homeCandidates.map((candidate) => ({
                id: candidate,
                label: candidate,
                secondary:
                    candidate === savedHome
                        ? 'saved default'
                        : candidate === props.initialCodexHome
                          ? 'passed via --codex-home'
                          : recentHomes.includes(candidate)
                            ? 'recent home'
                            : 'autodetected',
            })),
            {
                id: CUSTOM_HOME_ID,
                label: 'Enter a custom Codex home path',
                secondary: 'manual path entry',
            },
        ];

        return (
            <Box flexDirection="column">
                <Text bold color="cyan">
                    codex-cliner
                </Text>
                <Text>Select a Codex home before scanning or mutating local state.</Text>
                {savedHome ? <Text color="gray">Saved default: {savedHome}</Text> : null}
                {homeError ? <Text color="red">{homeError}</Text> : null}
                {customHomeMode ? (
                    <Box
                        marginTop={1}
                        flexDirection="column"
                        borderStyle="round"
                        borderColor="yellow"
                        paddingX={1}
                    >
                        <Text bold>Custom Codex home</Text>
                        <Text color="gray">Enter a path and press Enter. Esc cancels.</Text>
                        <TextInput
                            value={customHomeInput}
                            onChange={setCustomHomeInput}
                            onSubmit={(value) => void confirmCodexHome(value)}
                        />
                    </Box>
                ) : (
                    <SelectableList
                        title="Codex homes"
                        rows={rows}
                        cursor={homeCursor}
                        help={['Enter select', 'm manual path', 'h help', 'q quit']}
                    />
                )}
            </Box>
        );
    }

    if (!snapshot || !codexHome) {
        return <Text color="red">No Codex home selected.</Text>;
    }

    const menuRows = MAIN_MENU.map((item) => ({ id: item, label: item }));
    const recordRows = records.map((record) => ({
        id: record.id,
        label: `${record.title ?? 'Untitled'} (${record.id.slice(0, 8)})`,
        selected: selectedIds.has(record.id),
        secondary: `${record.projectName ?? 'unknown'}  ${formatBytes(record.size)}  ${relativeTime(record.updatedAt)}`,
    }));
    const projectRows = projects.map((project) => ({
        id: project.path ?? project.name,
        label: project.name,
        selected: selectedIds.has(project.path ?? project.name),
        secondary: `${project.sessionCount + project.archivedCount} sessions  ${formatBytes(project.totalBytes)}`,
    }));
    const backupRows = filteredBackups.map((run) => ({
        id: run.manifest.runId,
        label: run.manifest.runId,
        selected: selectedIds.has(run.manifest.runId),
        secondary: `${run.manifest.actionType}  ${run.manifest.sessionIds.length} sessions  ${formatBytes(run.manifest.totalBytes)}`,
    }));
    const backupItemRows = backupItems.map((item) => ({
        id: item.sourcePath,
        label: item.kind,
        selected: selectedBackupItemPaths.has(item.sourcePath),
        secondary: item.sourcePath,
    }));

    return (
        <Box flexDirection="column">
            <Text bold color="cyan">
                codex-cliner
            </Text>
            <Text color="gray">Codex home: {codexHome}</Text>
            {message ? <Text color="yellow">{message}</Text> : null}
            {filtering ? (
                <Box marginTop={1}>
                    <Text color="green">Filter: </Text>
                    <TextInput
                        value={filter}
                        onChange={setFilter}
                        onSubmit={() => setFiltering(false)}
                    />
                </Box>
            ) : null}
            <Box marginTop={1} flexDirection="row" gap={1}>
                <Box width={78} flexGrow={1}>
                    {view === 'menu' ? (
                        <SelectableList
                            title="Main menu"
                            rows={menuRows}
                            cursor={menuCursor}
                            help={['Enter select', 'h help', 'q quit']}
                        />
                    ) : null}
                    {view === 'active' ? (
                        <SelectableList
                            title="Active sessions"
                            rows={recordRows}
                            cursor={listCursor}
                            help={['Space select', 'd delete', '/ filter', 'h help', 'q back']}
                        />
                    ) : null}
                    {view === 'archived' ? (
                        <SelectableList
                            title="Archived sessions"
                            rows={recordRows}
                            cursor={listCursor}
                            help={['Space select', 'p prune', '/ filter', 'h help', 'q back']}
                        />
                    ) : null}
                    {view === 'stale' ? (
                        <SelectableList
                            title="Stale index records"
                            rows={recordRows}
                            cursor={listCursor}
                            help={['Space select', 'c clean stale', '/ filter', 'h help', 'q back']}
                        />
                    ) : null}
                    {view === 'projects' ? (
                        <SelectableList
                            title="Projects"
                            rows={projectRows}
                            cursor={listCursor}
                            help={['d delete project', '/ filter', 'h help', 'q back']}
                        />
                    ) : null}
                    {view === 'backups' ? (
                        <SelectableList
                            title="Backups"
                            rows={backupRows}
                            cursor={listCursor}
                            help={[
                                'Enter detail',
                                'Space select',
                                'r restore run',
                                'p prune selected/old',
                                '/ filter',
                                'h help',
                                'q back',
                            ]}
                        />
                    ) : null}
                    {view === 'backup-detail' ? (
                        <SelectableList
                            title={`Backup ${currentBackupRun?.manifest.runId ?? ''}`}
                            rows={backupItemRows}
                            cursor={backupItemCursor}
                            help={[
                                'Space select',
                                'r restore selected/current',
                                'R restore all',
                                'p prune run',
                                '/ filter',
                                'h help',
                                'q back',
                            ]}
                        />
                    ) : null}
                    {view === 'diagnostics' ? (
                        <Box
                            flexDirection="column"
                            borderStyle="round"
                            borderColor="cyan"
                            paddingX={1}
                        >
                            <Text bold>Diagnostics</Text>
                            <Text>Active sessions: {snapshot.activeSessions.length}</Text>
                            <Text>Archived sessions: {snapshot.archivedSessions.length}</Text>
                            <Text>Stale records: {snapshot.staleIndexRecords.length}</Text>
                            <Text>Projects: {snapshot.projectGroups.length}</Text>
                            <Text>Backups: {backupRuns.length}</Text>
                            <Text color="gray">q back</Text>
                        </Box>
                    ) : null}
                    {view === 'help' ? (
                        <Box
                            flexDirection="column"
                            borderStyle="round"
                            borderColor="cyan"
                            paddingX={1}
                        >
                            <Text bold>Help</Text>
                            <Text>Global</Text>
                            <Text color="gray">? or h open help q back/quit / filter</Text>
                            <Text>Lists</Text>
                            <Text color="gray">
                                Arrow keys move Space select a select all A clear
                            </Text>
                            <Text>Actions</Text>
                            <Text color="gray">
                                d delete p prune c clean stale r restore/refresh R restore full
                                backup run
                            </Text>
                            <Text>CLI help</Text>
                            <Text color="gray">
                                Use codex-cliner --help or codex-cliner &lt;command&gt; --help
                            </Text>
                            <Text>Storage</Text>
                            <Text color="gray">
                                Selected Codex home is saved in app-owned config outside Codex
                                paths.
                            </Text>
                        </Box>
                    ) : null}
                </Box>
                {view !== 'menu' ? (
                    <Box width={56}>
                        {renderDetailPane({
                            view,
                            records,
                            listCursor,
                            projects,
                            filteredBackups,
                            backupItems,
                            backupItemCursor,
                            snapshot,
                            currentBackupRun,
                        })}
                    </Box>
                ) : null}
            </Box>
            {confirmAction ? (
                <Box
                    marginTop={1}
                    flexDirection="column"
                    borderStyle="double"
                    borderColor="red"
                    paddingX={1}
                >
                    <Text color="red" bold>
                        {describeConfirmAction(confirmAction)}
                    </Text>
                    <TextInput
                        value={confirmInput}
                        onChange={setConfirmInput}
                        onSubmit={() => void runConfirmAction()}
                    />
                </Box>
            ) : null}
        </Box>
    );
}

function renderDetailPane(input: {
    view: View;
    records: SessionRecord[];
    listCursor: number;
    projects: ProjectGroup[];
    filteredBackups: BackupRun[];
    backupItems: BackupManifestItem[];
    backupItemCursor: number;
    snapshot: InventorySnapshot;
    currentBackupRun?: BackupRun;
}): React.JSX.Element {
    const record = input.records[input.listCursor];
    const project = input.projects[input.listCursor];
    const backup = input.currentBackupRun ?? input.filteredBackups[input.listCursor];
    const backupItem = input.backupItems[input.backupItemCursor];

    return (
        <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
            <Text bold>Details</Text>
            {input.view === 'active' || input.view === 'archived' || input.view === 'stale'
                ? renderRecordDetails(record)
                : null}
            {input.view === 'projects' ? renderProjectDetails(project) : null}
            {input.view === 'backups' ? renderBackupDetails(backup) : null}
            {input.view === 'backup-detail' ? renderBackupItemDetails(backup, backupItem) : null}
            {input.view === 'diagnostics' ? renderDiagnosticsDetails(input.snapshot) : null}
            {input.view === 'help' ? renderHelpDetails() : null}
        </Box>
    );
}

function renderRecordDetails(record?: SessionRecord): React.JSX.Element {
    if (!record) return <Text color="gray">No record selected.</Text>;
    return (
        <Box flexDirection="column" marginTop={1}>
            <Text>{record.title ?? 'Untitled thread'}</Text>
            <Text color="gray">{record.id}</Text>
            <Text>Kind: {record.kind}</Text>
            <Text>Updated: {relativeTime(record.updatedAt)}</Text>
            <Text>Size: {formatBytes(record.size)}</Text>
            <Text>Project: {record.projectName ?? 'unknown'}</Text>
            <Text>Confidence: {record.projectConfidence ?? 'low'}</Text>
            <Text>Files: {record.duplicateCount}</Text>
            <Text>Path: {record.relativePath}</Text>
            {record.projectPath ? <Text>Root: {record.projectPath}</Text> : null}
            {record.historyPreview.length > 0 ? (
                <Text>Preview: {record.historyPreview[0]}</Text>
            ) : (
                <Text color="gray">No history preview.</Text>
            )}
        </Box>
    );
}

function renderProjectDetails(project?: ProjectGroup): React.JSX.Element {
    if (!project) return <Text color="gray">No project selected.</Text>;
    return (
        <Box flexDirection="column" marginTop={1}>
            <Text>{project.name}</Text>
            {project.path ? <Text color="gray">{project.path}</Text> : null}
            <Text>Confidence: {project.confidence}</Text>
            <Text>Active: {project.sessionCount}</Text>
            <Text>Archived: {project.archivedCount}</Text>
            <Text>Total bytes: {formatBytes(project.totalBytes)}</Text>
            <Text>Unique sessions: {project.sessionIds.length}</Text>
        </Box>
    );
}

function renderBackupDetails(run?: BackupRun): React.JSX.Element {
    if (!run) return <Text color="gray">No backup selected.</Text>;
    return (
        <Box flexDirection="column" marginTop={1}>
            <Text>{run.manifest.runId}</Text>
            <Text>Action: {run.manifest.actionType}</Text>
            <Text>Created: {run.manifest.createdAt}</Text>
            <Text>Items: {run.manifest.items.length}</Text>
            <Text>Sessions: {run.manifest.sessionIds.length}</Text>
            <Text>Total bytes: {formatBytes(run.manifest.totalBytes)}</Text>
            <Text>Codex home: {run.manifest.codexHome}</Text>
            {run.manifest.notes ? <Text>Notes: {run.manifest.notes}</Text> : null}
        </Box>
    );
}

function renderBackupItemDetails(
    run: BackupRun | undefined,
    item?: BackupManifestItem
): React.JSX.Element {
    if (!run) return <Text color="gray">No backup selected.</Text>;
    return (
        <Box flexDirection="column" marginTop={1}>
            <Text>{run.manifest.runId}</Text>
            <Text>Action: {run.manifest.actionType}</Text>
            <Text>Item count: {run.manifest.items.length}</Text>
            {item ? (
                <>
                    <Text>Kind: {item.kind}</Text>
                    <Text>Source: {item.sourcePath}</Text>
                    <Text>Backup: {item.backupPath}</Text>
                </>
            ) : (
                <Text color="gray">Select a backup item to inspect or restore.</Text>
            )}
        </Box>
    );
}

function renderDiagnosticsDetails(snapshot: InventorySnapshot): React.JSX.Element {
    const totalBytes = [...snapshot.activeSessions, ...snapshot.archivedSessions].reduce(
        (sum, record) => sum + record.size,
        0
    );
    return (
        <Box flexDirection="column" marginTop={1}>
            <Text>Session index rows: {snapshot.sessionIndexCount}</Text>
            <Text>History previews: {snapshot.historyCount}</Text>
            <Text>Total known bytes: {formatBytes(totalBytes)}</Text>
            <Text>Stale index rows: {snapshot.staleIndexRecords.length}</Text>
        </Box>
    );
}

function renderHelpDetails(): React.JSX.Element {
    return (
        <Box flexDirection="column" marginTop={1}>
            <Text>Interactive help</Text>
            <Text color="gray">Use ? or h from most views to open this screen.</Text>
            <Text>Discover CLI commands</Text>
            <Text color="gray">codex-cliner --help</Text>
            <Text color="gray">codex-cliner scan --help</Text>
            <Text color="gray">codex-cliner restore --help</Text>
            <Text>Current behavior</Text>
            <Text color="gray">
                The selected Codex home is persisted in app config and reused on the next launch
                when still valid.
            </Text>
        </Box>
    );
}

function describeConfirmAction(action: ConfirmAction): string {
    if (action.type === 'delete-active') {
        return `Type DELETE to remove ${action.records.length} selected sessions.`;
    }
    if (action.type === 'prune-archived') {
        return `Type DELETE to prune ${action.records.length} archived session entries.`;
    }
    if (action.type === 'cleanup-stale') {
        return `Type DELETE to clean ${action.records.length} stale index entries.`;
    }
    if (action.type === 'delete-project') {
        return `Type DELETE to remove project ${action.project.name} (${action.records.length} sessions).`;
    }
    if (action.restoreAll) {
        return `Type DELETE to restore the full backup run ${action.run.manifest.runId}.`;
    }
    return `Type DELETE to restore ${action.items.length} selected backup item${action.items.length === 1 ? '' : 's'}.`;
}

function matchesFilter(values: Array<string | undefined>, filter: string): boolean {
    if (!filter.trim()) return true;
    const needle = filter.toLowerCase();
    return values.some((value) => value?.toLowerCase().includes(needle));
}
