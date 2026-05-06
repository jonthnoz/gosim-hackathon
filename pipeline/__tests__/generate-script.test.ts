import { describe, expect, test } from 'bun:test';
import { generateScript, parseScriptJson, renderScriptPrompt } from '../generate-script.ts';
import type { Listing, Script } from '../types.ts';

const sampleListing: Listing = {
    id: 'l1', source: 'inside_airbnb', source_id: '2721397',
    name: 'Marais loft', description: '### About\nParquet floors. Tall windows.',
    photo_urls: ['x'], external_url: 'https://example/2721397',
    city: 'Paris', neighborhood: 'Hôtel-de-Ville',
};

describe('renderScriptPrompt', () => {
    test('substitutes Mustache placeholders', () => {
        const tpl = 'Listing: {{name}} in {{neighborhood}}\n{{description}}';
        const out = renderScriptPrompt(tpl, sampleListing);
        expect(out).toContain('Listing: Marais loft in Hôtel-de-Ville');
        expect(out).toContain('Parquet floors. Tall windows.');
    });
    test('replaces missing fields with empty string', () => {
        const tpl = '{{nonexistent}}!';
        const out = renderScriptPrompt(tpl, sampleListing);
        expect(out).toBe('!');
    });
});

describe('parseScriptJson', () => {
    test('extracts JSON from a code-fenced response', () => {
        const raw = '```json\n' + JSON.stringify({
            title: 'T', hookText: 'H', narration: 'N',
            titleCardPrompt: 'a', lifestylePrompt: 'b', endCardPrompt: 'c',
            musicPrompt: 'm', caption: 'C', hashtags: ['#a'],
        }) + '\n```';
        const s: Script = parseScriptJson(raw);
        expect(s.title).toBe('T');
    });
    test('strips em dashes from text fields', () => {
        const raw = JSON.stringify({
            title: 'a — b', hookText: 'H', narration: 'x — y',
            titleCardPrompt: '1', lifestylePrompt: '2', endCardPrompt: '3',
            musicPrompt: 'm', caption: 'C', hashtags: ['#x'],
        });
        const s = parseScriptJson(raw);
        expect(s.title).not.toContain('—');
        expect(s.narration).not.toContain('—');
    });
    test('throws when required field missing', () => {
        const raw = JSON.stringify({ title: 'T' });
        expect(() => parseScriptJson(raw)).toThrow(/missing/i);
    });
});

describe('generateScript', () => {
    const validNarration = 'Balcony over the river, and original beams catching the morning light. You are in Le Marais, in Hôtel-de-Ville. Three minutes from Place des Vosges and ten from Notre-Dame. Cobblestones under your feet, croissants on the corner, and the heartbeat of Paris right at your door. And the part the photos miss: the parquet floor catches afternoon light like a mirror. This is the Paris you actually came for. Tap to book.';

    test('returns ScriptResult with retryCount=0 on first-try success', async () => {
        const fakeMinimax = {
            chat: async (prompt: string) => {
                expect(prompt).toContain('Marais loft');
                return JSON.stringify({
                    title: 'T', hookText: 'BALCONY OVER THE RIVER', narration: validNarration,
                    titleCardPrompt: 'tc', lifestylePrompt: 'ls', endCardPrompt: 'ec',
                    musicPrompt: 'm', caption: 'C', hashtags: ['#paris', '#airbnb', '#marais', '#parisstay', '#parisapartment'],
                });
            },
        };
        const r = await generateScript(sampleListing, 'Listing {{name}}\n{{description}}', fakeMinimax as never);
        expect(r.script.narration).toBe(validNarration);
        expect(r.retryCount).toBe(0);
        expect(r.validationFailures[0]).toEqual([]);
    });

    test('retries with feedback when narration is too short', async () => {
        const calls: string[] = [];
        const fakeMinimax = {
            chat: async (prompt: string) => {
                calls.push(prompt);
                const isRetry = prompt.includes('PRIOR ATTEMPT FAILED');
                return JSON.stringify({
                    title: 'T', hookText: 'BALCONY OVER',
                    narration: isRetry ? validNarration : 'Too short.',
                    titleCardPrompt: 'tc', lifestylePrompt: 'ls', endCardPrompt: 'ec',
                    musicPrompt: 'm', caption: 'C', hashtags: ['#a', '#b', '#c', '#d', '#e'],
                });
            },
        };
        const r = await generateScript(sampleListing, 't {{name}}', fakeMinimax as never);
        expect(r.retryCount).toBe(1);
        expect(calls.length).toBe(2);
        expect(calls[1]).toContain('narration must be');
        expect(r.validationFailures[0]!.length).toBeGreaterThan(0);
        expect(r.validationFailures[1]).toEqual([]);
    });
});
