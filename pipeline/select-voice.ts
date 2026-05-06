// LLM-driven voice persona selection.
// Picks a voice from the Token Plan's verified catalog based on the listing's
// description / mood. Returns voiceId + a one-sentence rationale that's
// surfaced in the UI's "How this reel was made" disclosure.
//
// Strategy: have M2 return a NUMBER (1..N) instead of an id string. Numbers
// can't be mistyped, hallucinated, or partially matched. Only the rationale
// is free-form.

import type { Minimax } from './minimax.ts';
import type { Listing } from './types.ts';

export interface VoicePersona {
    voiceId: string;
    rationale: string;
}

/**
 * Verified voices on this Token Plan tier (probed 2026-05-06).
 * Curated to 4 stylistically distinct picks (2 male / 2 female) — fewer choices
 * = lower confusion + clearer agentic decision in the demo.
 */
const CATALOG = [
    { id: 'English_Trustworth_Man',  persona: 'measured male, mid-Atlantic, calm authority — fits classic / Haussmannian / professional stays' },
    { id: 'English_Aussie_Bloke',    persona: 'casual male, energetic, friendly — fits youthful / hostel / weekend stays' },
    { id: 'Wise_Woman',              persona: 'mature female, warm and refined — fits curated / heritage / boutique stays' },
    { id: 'English_Sweet_Female_4',  persona: 'softer female, gentle and intimate — fits cosy / artistic / quiet stays' },
] as const;

const FALLBACK = CATALOG[0]; // English_Trustworth_Man

const SELECT_PROMPT = `You are casting the narrator voice for a 30-second short-stay listing reel.

LISTING:
- Name: {{name}}
- Neighborhood: {{neighborhood}}, {{city}}

DESCRIPTION:
{{description}}

VOICE OPTIONS:
${CATALOG.map((v, i) => `${i + 1}. ${v.persona}`).join('\n')}

YOUR TASK:
Pick the option (1, 2, 3, or 4) whose persona best matches the listing's vibe.

OUTPUT — return ONLY a single JSON object on one line, no markdown, no code fences:
{"choice": <integer 1-${CATALOG.length}>, "rationale": "<one sentence, 12-20 words, why this voice fits>"}

Example outputs:
{"choice": 1, "rationale": "Classic stone-and-parquet apartment in the 8th calls for a measured, grounded male voice."}
{"choice": 4, "rationale": "Tiny bohemian studio with vintage details — the gentle female voice matches the intimate scale."}`;

export async function selectVoice(listing: Listing, minimax: Pick<Minimax, 'chat'>): Promise<VoicePersona> {
    const prompt = SELECT_PROMPT
        .replace(/\{\{name\}\}/g, listing.name)
        .replace(/\{\{neighborhood\}\}/g, listing.neighborhood ?? '')
        .replace(/\{\{city\}\}/g, listing.city ?? '')
        .replace(/\{\{description\}\}/g, listing.description);

    let raw: string;
    try {
        raw = await minimax.chat(prompt, 2500);
    } catch {
        return { voiceId: FALLBACK.id, rationale: 'fallback — voice-selection call failed' };
    }

    // Strip code fences + extract first {...} block
    let text = raw.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '').trim();
    const m = text.match(/\{[\s\S]*?\}/);
    if (m) text = m[0];

    let parsed: { choice?: unknown; rationale?: unknown };
    try {
        parsed = JSON.parse(text) as typeof parsed;
    } catch {
        return { voiceId: FALLBACK.id, rationale: 'fallback — voice JSON did not parse' };
    }

    const choice = typeof parsed.choice === 'number'
        ? parsed.choice
        : typeof parsed.choice === 'string'
            ? parseInt(parsed.choice, 10)
            : NaN;

    if (!Number.isInteger(choice) || choice < 1 || choice > CATALOG.length) {
        return {
            voiceId: FALLBACK.id,
            rationale: `fallback — LLM returned choice=${JSON.stringify(parsed.choice)} (expected 1-${CATALOG.length})`,
        };
    }

    const matched = CATALOG[choice - 1]!;
    const rationale = typeof parsed.rationale === 'string'
        ? parsed.rationale.slice(0, 200)
        : `selected voice ${choice} of ${CATALOG.length}`;

    return { voiceId: matched.id, rationale };
}

export const VOICE_CATALOG = CATALOG;
