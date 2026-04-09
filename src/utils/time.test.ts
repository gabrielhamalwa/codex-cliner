import { describe, expect, it } from 'vitest';
import { makeRunId } from './time.js';

describe('makeRunId', () => {
    it('produces a stable readable id with random suffix', () => {
        const id = makeRunId(new Date('2026-04-09T14:00:00.123Z'), 0.5);
        expect(id).toMatch(/^2026-04-09T14-00-00Z_[a-z0-9]{6}$/);
    });

    it('changes suffix when randomness changes', () => {
        const a = makeRunId(new Date('2026-04-09T14:00:00.123Z'), 0.1);
        const b = makeRunId(new Date('2026-04-09T14:00:00.123Z'), 0.2);
        expect(a).not.toBe(b);
    });
});
