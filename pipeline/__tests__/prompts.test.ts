// pipeline/__tests__/prompts.test.ts
import { describe, expect, test } from 'bun:test';
import { loadPrompt } from '../prompts.ts';

describe('loadPrompt', () => {
    test('rejects names with path traversal', async () => {
        await expect(loadPrompt('../etc/passwd')).rejects.toThrow(/invalid prompt name/i);
        await expect(loadPrompt('foo/bar')).rejects.toThrow(/invalid prompt name/i);
    });

    test('throws if file missing', async () => {
        await expect(loadPrompt('nonexistent-prompt-xyz')).rejects.toThrow();
    });

    test('reads prompts/script.md if present (smoke; depends on script.md being written in this task)', async () => {
        try {
            const out = await loadPrompt('script');
            expect(out.length).toBeGreaterThan(100);
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
            throw err;
        }
    });
});
