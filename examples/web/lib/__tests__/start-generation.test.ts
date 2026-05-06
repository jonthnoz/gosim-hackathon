import { describe, expect, test } from 'bun:test';
import { startGeneration } from '../start-generation.ts';

function fakeSb(state: { active: { id: string } | null; insertResult: 'ok' | '23505' }) {
    return {
        from: (_t: string) => ({
            select: () => ({
                eq: () => ({
                    in: () => ({
                        maybeSingle: async () => ({ data: state.active, error: null }),
                    }),
                }),
            }),
            insert: () => ({
                select: () => ({
                    single: async () => state.insertResult === 'ok'
                        ? { data: { id: 'new-reel' }, error: null }
                        : { data: null, error: { code: '23505', message: 'unique' } },
                }),
            }),
        }),
    } as never;
}

describe('startGeneration', () => {
    test('returns existing active reel when one exists (idempotent)', async () => {
        const sb = fakeSb({ active: { id: 'existing-reel' }, insertResult: 'ok' });
        const res = await startGeneration(sb, 'listing-123');
        expect(res.reelId).toBe('existing-reel');
        expect(res.startedNew).toBe(false);
    });

    test('inserts a new reel when none active', async () => {
        const sb = fakeSb({ active: null, insertResult: 'ok' });
        const res = await startGeneration(sb, 'listing-123');
        expect(res.reelId).toBe('new-reel');
        expect(res.startedNew).toBe(true);
    });

    test('handles 23505 race by returning the active reel that won', async () => {
        let selectCalls = 0;
        const sb = {
            from: () => ({
                select: () => ({
                    eq: () => ({
                        in: () => ({
                            maybeSingle: async () => {
                                selectCalls++;
                                return selectCalls === 1
                                    ? { data: null, error: null }
                                    : { data: { id: 'race-winner' }, error: null };
                            },
                        }),
                    }),
                }),
                insert: () => ({
                    select: () => ({
                        single: async () => ({ data: null, error: { code: '23505', message: 'unique' } }),
                    }),
                }),
            }),
        } as never;
        const res = await startGeneration(sb, 'listing-123');
        expect(res.reelId).toBe('race-winner');
        expect(res.startedNew).toBe(false);
    });
});
