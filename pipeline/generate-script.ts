import type { Minimax } from './minimax.ts';
import type { Listing, Script } from './types.ts';

export function renderScriptPrompt(template: string, listing: Listing): string {
    const data: Record<string, string> = {
        name: listing.name,
        description: listing.description,
        neighborhood: listing.neighborhood ?? '',
        city: listing.city ?? '',
        external_url: listing.external_url ?? '',
    };
    return template.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => data[key] ?? '');
}

const REQUIRED: (keyof Script)[] = [
    'title', 'hookText', 'narration',
    'titleCardPrompt', 'lifestylePrompt', 'endCardPrompt',
    'musicPrompt', 'caption', 'hashtags',
];

/**
 * Escape unescaped control characters that appear inside JSON string literals.
 * M2 sometimes emits raw \n / \r / \t inside the caption (where the prompt asks
 * for blank lines between paragraphs); strict JSON.parse rejects those. This
 * walks the text once and only escapes control chars while inside `"..."`.
 */
function escapeControlCharsInStrings(text: string): string {
    let out = '';
    let inString = false;
    let escape = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i]!;
        if (escape) { out += ch; escape = false; continue; }
        if (ch === '\\' && inString) { out += ch; escape = true; continue; }
        if (ch === '"') { inString = !inString; out += ch; continue; }
        if (inString) {
            if (ch === '\n') { out += '\\n'; continue; }
            if (ch === '\r') { out += '\\r'; continue; }
            if (ch === '\t') { out += '\\t'; continue; }
        }
        out += ch;
    }
    return out;
}

export function parseScriptJson(raw: string): Script {
    let text = raw.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '').trim();
    const m = text.match(/\{[\s\S]*\}/);
    if (m) text = m[0];
    let parsed: Record<string, unknown>;
    try {
        parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
        const escaped = escapeControlCharsInStrings(text);
        try {
            parsed = JSON.parse(escaped) as Record<string, unknown>;
        } catch {
            const cleaned = escaped
                .replace(/,\s*([\]}])/g, '$1')
                .replace(/:\s*'([^']*)'/g, ': "$1"');
            parsed = JSON.parse(cleaned) as Record<string, unknown>;
        }
    }
    for (const k of REQUIRED) {
        if (parsed[k] === undefined) throw new Error(`Script missing field: ${k}`);
    }
    const stripDash = (s: string) => s.replace(/\s*—\s*/g, ', ');
    return {
        title: stripDash(parsed['title'] as string),
        hookText: stripDash(parsed['hookText'] as string),
        narration: stripDash(parsed['narration'] as string),
        titleCardPrompt: parsed['titleCardPrompt'] as string,
        lifestylePrompt: parsed['lifestylePrompt'] as string,
        endCardPrompt: parsed['endCardPrompt'] as string,
        musicPrompt: parsed['musicPrompt'] as string,
        caption: stripDash(parsed['caption'] as string),
        hashtags: parsed['hashtags'] as string[],
    };
}

// --- Schema validation (post-parse) -------------------------------------

const NARRATION_WORDS_MIN = 65;
const NARRATION_WORDS_MAX = 100;
const HOOK_MAX_WORDS = 7;

function countWords(s: string): number {
    return s.trim().split(/\s+/).filter(Boolean).length;
}

/** Returns an array of human-readable failures; empty array means valid. */
export function validateScript(script: Script): string[] {
    const fails: string[] = [];
    const nWords = countWords(script.narration);
    if (nWords < NARRATION_WORDS_MIN || nWords > NARRATION_WORDS_MAX) {
        fails.push(`narration must be ${NARRATION_WORDS_MIN}-${NARRATION_WORDS_MAX} words (got ${nWords})`);
    }
    const hookWords = countWords(script.hookText);
    if (hookWords > HOOK_MAX_WORDS) {
        fails.push(`hookText must be at most ${HOOK_MAX_WORDS} words (got ${hookWords})`);
    }
    if (script.hookText !== script.hookText.toUpperCase()) {
        fails.push(`hookText must be ALL CAPS`);
    }
    if (!Array.isArray(script.hashtags) || script.hashtags.length === 0) {
        fails.push(`hashtags must be a non-empty array`);
    } else {
        // Some Token Plan responses bundle 5 tags into a single string. Split + flatten.
        const flat = script.hashtags.flatMap((h) => h.split(/\s+/)).filter(Boolean);
        if (flat.some((h) => !h.startsWith('#'))) {
            fails.push(`every hashtag must start with #`);
        }
    }
    return fails;
}

// --- Generation with retry on validation failure ------------------------

const MAX_RETRIES = 2;

export interface ScriptResult {
    script: Script;
    retryCount: number;
    validationFailures: string[][]; // failures per attempt; last entry empty on success
}

export async function generateScript(
    listing: Listing,
    promptTemplate: string,
    minimax: Pick<Minimax, 'chat'>,
): Promise<ScriptResult> {
    const basePrompt = renderScriptPrompt(promptTemplate, listing);
    const failuresByAttempt: string[][] = [];

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const promptForAttempt = attempt === 0
            ? basePrompt
            : `${basePrompt}\n\n---\nPRIOR ATTEMPT FAILED VALIDATION:\n${failuresByAttempt[attempt - 1]!.map((f) => `- ${f}`).join('\n')}\nFix these specific issues. Return the same JSON shape.`;

        let script: Script;
        try {
            const raw = await minimax.chat(promptForAttempt, 5000);
            script = parseScriptJson(raw);
        } catch (err) {
            failuresByAttempt.push([`parse error: ${(err as Error).message}`]);
            if (attempt === MAX_RETRIES) throw err;
            continue;
        }

        const fails = validateScript(script);
        failuresByAttempt.push(fails);
        if (fails.length === 0) {
            return { script, retryCount: attempt, validationFailures: failuresByAttempt };
        }
        if (attempt === MAX_RETRIES) {
            // Out of retries — return the last attempt anyway; downstream still gets a script.
            return { script, retryCount: attempt, validationFailures: failuresByAttempt };
        }
    }
    // Unreachable, but TS wants exhaustive return.
    throw new Error('script generation exhausted retries');
}
