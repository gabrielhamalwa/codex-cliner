import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { scanInventory } from './scan.js';

async function makeFixture(): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-cliner-inventory-'));
    await fs.mkdir(path.join(root, 'sessions', '2026', '04', '09'), { recursive: true });
    await fs.mkdir(path.join(root, 'archived_sessions'), { recursive: true });
    await fs.writeFile(
        path.join(
            root,
            'sessions',
            '2026',
            '04',
            '09',
            'rollout-2026-04-09T10-00-00-11111111-1111-4111-8111-111111111111.jsonl'
        ),
        [
            JSON.stringify({
                type: 'session_meta',
                payload: {
                    id: '11111111-1111-4111-8111-111111111111',
                    originator: 'Codex Desktop',
                },
                context: { cwd: '/tmp/project-a' },
            }),
            JSON.stringify({ type: 'event_msg', payload: { message: 'hello' } }),
        ].join('\n')
    );
    await fs.writeFile(
        path.join(
            root,
            'sessions',
            '2026',
            '04',
            '09',
            'rollout-2026-04-09T10-05-00-11111111-1111-4111-8111-111111111111.jsonl'
        ),
        JSON.stringify({
            type: 'event_msg',
            payload: { message: 'duplicate session file', cwd: '/tmp/project-a' },
        })
    );
    await fs.writeFile(
        path.join(
            root,
            'archived_sessions',
            'rollout-2026-04-09T11-00-00-22222222-2222-4222-8222-222222222222.jsonl'
        ),
        JSON.stringify({
            type: 'session_meta',
            payload: { id: '22222222-2222-4222-8222-222222222222', cwd: '/tmp/project-b' },
        })
    );
    await fs.writeFile(
        path.join(root, 'session_index.jsonl'),
        [
            JSON.stringify({
                id: '11111111-1111-4111-8111-111111111111',
                thread_name: 'Active thread',
                updated_at: '2026-04-09T10:00:00Z',
            }),
            JSON.stringify({
                id: '22222222-2222-4222-8222-222222222222',
                thread_name: 'Archived thread',
                updated_at: '2026-04-09T11:00:00Z',
            }),
            JSON.stringify({
                id: '33333333-3333-4333-8333-333333333333',
                thread_name: 'Missing thread',
                updated_at: '2026-04-09T12:00:00Z',
            }),
        ].join('\n') + '\n'
    );
    await fs.writeFile(
        path.join(root, 'history.jsonl'),
        [
            JSON.stringify({
                session_id: '11111111-1111-4111-8111-111111111111',
                text: 'preview a',
            }),
            JSON.stringify({
                session_id: '33333333-3333-4333-8333-333333333333',
                text: 'preview missing',
            }),
        ].join('\n') + '\n'
    );
    return root;
}

async function makeProjectInferenceFixture(): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-cliner-projects-'));
    const gitProject = path.join(root, 'workspace-git', 'apps', 'client');
    const markerProject = path.join(root, 'workspace-marker', 'packages', 'tool');

    await fs.mkdir(path.join(root, 'sessions', '2026', '04', '10'), { recursive: true });
    await fs.mkdir(path.join(root, 'archived_sessions'), { recursive: true });
    await fs.mkdir(path.join(root, 'workspace-git', '.git'), { recursive: true });
    await fs.mkdir(markerProject, { recursive: true });
    await fs.writeFile(
        path.join(root, 'workspace-marker', 'package.json'),
        '{"name":"workspace-marker"}\n'
    );

    await fs.writeFile(
        path.join(
            root,
            'sessions',
            '2026',
            '04',
            '10',
            'rollout-2026-04-10T09-00-00-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jsonl'
        ),
        JSON.stringify({
            type: 'session_meta',
            payload: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', cwd: gitProject },
        }) + '\n'
    );
    await fs.writeFile(
        path.join(
            root,
            'sessions',
            '2026',
            '04',
            '10',
            'rollout-2026-04-10T09-10-00-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jsonl'
        ),
        JSON.stringify({
            type: 'session_meta',
            payload: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', cwd: markerProject },
        }) + '\n'
    );
    await fs.writeFile(
        path.join(root, 'session_index.jsonl'),
        [
            JSON.stringify({
                id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                thread_name: 'Git root session',
                updated_at: '2026-04-10T09:00:00Z',
            }),
            JSON.stringify({
                id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                thread_name: 'Marker root session',
                updated_at: '2026-04-10T09:10:00Z',
            }),
        ].join('\n') + '\n'
    );
    await fs.writeFile(path.join(root, 'history.jsonl'), '');
    return root;
}

describe('scanInventory', () => {
    it('merges active, archived, and stale session state', async () => {
        const root = await makeFixture();
        const inventory = await scanInventory(root);
        expect(inventory.activeSessions).toHaveLength(1);
        expect(inventory.archivedSessions).toHaveLength(1);
        expect(inventory.staleIndexRecords).toHaveLength(1);
        expect(inventory.activeSessions[0]?.projectName).toBe('project-a');
        expect(inventory.archivedSessions[0]?.title).toBe('Archived thread');
        expect(inventory.staleIndexRecords[0]?.title).toBe('Missing thread');
        expect(inventory.activeSessions[0]?.duplicateCount).toBe(2);
        expect(inventory.activeSessions[0]?.absolutePaths).toHaveLength(2);
    });

    it('prefers the nearest git root for project grouping', async () => {
        const root = await makeProjectInferenceFixture();
        const inventory = await scanInventory(root);
        const gitSession = inventory.activeSessions.find(
            (record) => record.id === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
        );

        expect(gitSession?.projectName).toBe('workspace-git');
        expect(gitSession?.projectPath).toBe(path.join(root, 'workspace-git'));
        expect(gitSession?.projectConfidence).toBe('high');
    });

    it('falls back to the nearest project marker root when no git root exists', async () => {
        const root = await makeProjectInferenceFixture();
        const inventory = await scanInventory(root);
        const markerSession = inventory.activeSessions.find(
            (record) => record.id === 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
        );

        expect(markerSession?.projectName).toBe('workspace-marker');
        expect(markerSession?.projectPath).toBe(path.join(root, 'workspace-marker'));
        expect(markerSession?.projectConfidence).toBe('medium');
    });
});
