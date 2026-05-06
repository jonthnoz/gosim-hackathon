// LLM-driven photo selection for the Ken-Burns sequence.
// Given many candidate photos from a listing's gallery, pick the best 5 by
// (1) visual diversity — don't repeat the same room — and (2) usefulness —
// prefer main living spaces over secondary shots (bathrooms, decor closeups,
// hallway corners).

import type { Minimax } from './minimax.ts';

export interface PhotoCandidate {
    position: number;          // 1-based position in the gallery
    width: number;
    height: number;
    signatureHex: string;      // 64-byte 8x8 grayscale, hex-encoded
    url: string;               // muscache URL (not sent to M2 — local only)
}

export interface PhotoSelection {
    chosenPositions: number[];     // 1-based indices into candidates
    rationale: string;
    method: 'llm' | 'fallback-stride' | 'fallback-first-n';
}

const TARGET = 5;
const SIM_THRESHOLD = 0.20;          // Hamming distance / total bits — below this, photos are "near-duplicates"

/**
 * Hamming distance between two hex strings (interpreted as bit sequences).
 * Returns the fraction of differing bits (0 = identical, 1 = fully different).
 */
function hammingDistanceFraction(hexA: string, hexB: string): number {
    if (hexA.length !== hexB.length) return 1;
    let differingBits = 0;
    let totalBits = 0;
    for (let i = 0; i < hexA.length; i += 2) {
        const a = parseInt(hexA.slice(i, i + 2), 16);
        const b = parseInt(hexB.slice(i, i + 2), 16);
        if (Number.isNaN(a) || Number.isNaN(b)) continue;
        differingBits += popcount(a ^ b);
        totalBits += 8;
    }
    return totalBits === 0 ? 1 : differingBits / totalBits;
}

function popcount(n: number): number {
    let count = 0;
    while (n) { count += n & 1; n >>>= 1; }
    return count;
}

/**
 * Greedy-cluster candidates by signature similarity. Two photos with Hamming
 * distance below SIM_THRESHOLD land in the same cluster. Returns an array of
 * clusters (each is a list of 1-based positions).
 */
function clusterBySignature(candidates: PhotoCandidate[]): number[][] {
    const clusters: number[][] = [];
    for (const c of candidates) {
        let placed = false;
        for (const cluster of clusters) {
            const repIdx = cluster[0]! - 1;
            const rep = candidates[repIdx]!;
            const d = hammingDistanceFraction(rep.signatureHex, c.signatureHex);
            if (d < SIM_THRESHOLD) {
                cluster.push(c.position);
                placed = true;
                break;
            }
        }
        if (!placed) clusters.push([c.position]);
    }
    return clusters;
}

const SELECT_PROMPT = `You are choosing the {{target}} photos that will appear in a 30-second short-stay reel for an Airbnb-style listing. The photos cycle through with Ken-Burns motion, one shot every ~4 seconds.

You see {{count}} candidate photos from the host's gallery. For each photo you have:
- position: 1-based order in the gallery (hosts curate, low position = featured)
- size: pixel dimensions

A code-side perceptual-hash analysis has already grouped photos into VISUAL CLUSTERS. Photos in the same cluster look near-identical (same room, same angle), so you should pick AT MOST ONE per cluster.

VISUAL CLUSTERS:
{{clusters}}

CANDIDATES:
{{candidates}}

YOUR JOB:
Pick exactly {{target}} positions that play well as a sequence — this is the visual walk-through the viewer experiences while the narration plays.

Selection priorities, in order:
1. ONE PER CLUSTER. Two near-identical photos wastes a slot.
2. PRIORITISE photos that show distinct subjects/scenes/perspectives relevant to the topic. The topic could be a place, a process, a product, a creature, an event — pick photos that reveal different aspects of it.
3. DEPRIORITISE: tight closeups of single decorative or incidental objects (a single flower pot, a logo, a sign), blurry or dark shots, and frames that mostly show empty negative space.
4. PREFER WIDER establishing shots over tight detail-only shots.
5. KEEP VARIETY in lighting / time-of-day / angle when the candidates allow it.
6. The first chosen photo plays right after the opening title card — pick something that quickly says "this is the subject".

When in doubt, pick the lower-position photo (the host or author's curation is a signal).

YOUR RATIONALE must describe the actual subjects of the photos you picked — do not borrow vocabulary from these instructions. If the topic is bees, the rationale must talk about bees / hives / flowers. If the topic is a recipe, talk about the dish or its ingredients. If you are not sure what's in a photo, describe it generically (e.g., "wide environmental shot at position 4") rather than inventing details.

OUTPUT — return ONLY a single JSON object on one line, no markdown, no code fences, no commentary before or after:
{"positions":[<5 distinct integers in 1..{{count}}>],"rationale":"<one sentence, 18-28 words, what differentiates these picks for THIS subject>"}

ILLUSTRATIVE FORMAT EXAMPLES (do NOT copy the words; copy the shape):
{"positions":[1,4,7,10,14],"rationale":"<one sentence describing what's distinctive about each pick relative to your candidates>"}
{"positions":[2,5,8,11,16],"rationale":"<one sentence covering the visual variety the picks span>"}`;

function buildPrompt(candidates: PhotoCandidate[], clusters: number[][]): string {
    const list = candidates
        .map((c) => `${c.position}. ${c.width}x${c.height}`)
        .join('\n');
    const clusterStr = clusters
        .map((c, i) => `  Cluster ${String.fromCharCode(65 + i)}: ${c.join(', ')}`)
        .join('\n');
    return SELECT_PROMPT
        .replace(/\{\{target\}\}/g, String(TARGET))
        .replace(/\{\{count\}\}/g, String(candidates.length))
        .replace('{{clusters}}', clusterStr)
        .replace('{{candidates}}', list);
}

/**
 * Stride-sampling fallback: pick `target` evenly-spaced positions across the
 * candidate range. Uses the lowest-position (hero) as the first pick.
 */
function fallbackStride(candidates: PhotoCandidate[], target: number): number[] {
    if (candidates.length <= target) return candidates.map((c) => c.position);
    const step = (candidates.length - 1) / (target - 1);
    const positions = new Set<number>();
    for (let i = 0; i < target; i++) {
        const idx = Math.round(i * step);
        positions.add(candidates[idx]!.position);
    }
    // If rounding caused dupes, fill from low positions
    let cursor = 0;
    while (positions.size < target && cursor < candidates.length) {
        positions.add(candidates[cursor]!.position);
        cursor++;
    }
    return Array.from(positions).slice(0, target).sort((a, b) => a - b);
}

export async function selectPhotos(
    candidates: PhotoCandidate[],
    minimax: Pick<Minimax, 'chat'>,
): Promise<PhotoSelection> {
    if (candidates.length <= TARGET) {
        return {
            chosenPositions: candidates.map((c) => c.position),
            rationale: `only ${candidates.length} candidate${candidates.length === 1 ? '' : 's'}; using all`,
            method: 'fallback-first-n',
        };
    }

    const clusters = clusterBySignature(candidates);
    let raw: string;
    try {
        raw = await minimax.chat(buildPrompt(candidates, clusters), 8000);
    } catch {
        return {
            chosenPositions: fallbackStride(candidates, TARGET),
            rationale: 'fallback — LLM call failed; spread evenly across gallery',
            method: 'fallback-stride',
        };
    }

    let text = raw.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '').trim();
    const m = text.match(/\{[\s\S]*?\}/);
    if (m) text = m[0];

    let parsed: { positions?: unknown; rationale?: unknown };
    try {
        parsed = JSON.parse(text) as typeof parsed;
    } catch {
        return {
            chosenPositions: fallbackStride(candidates, TARGET),
            rationale: 'fallback — selection JSON did not parse; spread evenly',
            method: 'fallback-stride',
        };
    }

    const validPositions = new Set(candidates.map((c) => c.position));
    const positions = Array.isArray(parsed.positions)
        ? (parsed.positions
              .map((p) => (typeof p === 'number' ? p : typeof p === 'string' ? parseInt(p, 10) : NaN))
              .filter((p) => Number.isInteger(p) && validPositions.has(p)) as number[])
        : [];
    const unique = Array.from(new Set(positions));

    if (unique.length !== TARGET) {
        return {
            chosenPositions: fallbackStride(candidates, TARGET),
            rationale: `fallback — LLM proposed ${unique.length}/${TARGET} valid positions; spread evenly instead`,
            method: 'fallback-stride',
        };
    }

    return {
        chosenPositions: unique,
        rationale: typeof parsed.rationale === 'string' ? parsed.rationale.slice(0, 240) : '',
        method: 'llm',
    };
}
