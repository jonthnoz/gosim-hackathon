#!/usr/bin/env bun
/*
 * Airbnb adapter: for each listing, scrape candidate photo URLs from the
 * source gallery (clicks "Show all photos" if present), upload them to
 * Storage, and store ALL of them in `listings.photo_urls`.
 *
 * NO AI selection here — this is data sourcing. The pipeline picks the best 5
 * at reel-generation time (see pipeline/select-photos.ts), so each reel run
 * can make its own taste decision.
 *
 * Usage:
 *   bun run adapters/airbnb/expand-photos.ts                # all listings
 *   bun run adapters/airbnb/expand-photos.ts <listingId>    # one listing
 */

import { execSync } from 'node:child_process';
import { loadConfig } from '../../pipeline/config.ts';
import { createServiceClient } from '../../pipeline/supabase.ts';
import { uploadBuffer } from '../../pipeline/storage.ts';

const SESSION = 'lensbnb-airbnb-expand';
const MAX_CANDIDATES = 18;       // cap how many we scrape + upload per listing
const MIN_USEFUL = 5;            // below this, log a warning so the user notices

interface ListingRow {
    id: string;
    source_id: string;
    external_url: string | null;
    photo_urls: string[];
}

const EXTRACT_PHOTO_URLS_JS = `
JSON.stringify(
    Array.from(document.querySelectorAll('img'))
        .map(i => i.currentSrc || i.src)
        .filter(u => u && u.includes('muscache.com/im/pictures/'))
        .filter(u => !u.includes('AirbnbPlatformAssets'))
        .filter(u => !u.includes('airbnb-platform-assets'))
        .filter(u => !u.includes('/im/pictures/user/'))
        .filter(u => /\\.(jpe?g|png|webp)/i.test(u))
        .filter((u, i, arr) => {
            const key = u.split('?')[0];
            return arr.findIndex(x => x.split('?')[0] === key) === i;
        })
)
`.trim();

function browser(args: string[], input?: string): string {
    const cmd = ['agent-browser', '--session', SESSION, ...args];
    return execSync(cmd.map((a) => (a.includes(' ') ? JSON.stringify(a) : a)).join(' '), {
        input,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'inherit'],
    });
}
function browserSafe(args: string[], input?: string): string | null {
    try { return browser(args, input); } catch { return null; }
}

function bumpResolution(url: string, width: number): string {
    return `${url.split('?')[0]}?im_w=${width}`;
}

async function downloadBuffer(url: string): Promise<Buffer> {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`download ${url}: ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
}

async function scrapeCandidates(listingUrl: string): Promise<string[]> {
    browserSafe(['open', listingUrl]);
    browserSafe([
        'wait',
        '--fn',
        `Array.from(document.querySelectorAll('img')).filter(i => (i.currentSrc||i.src).includes('muscache.com/im/pictures/') && !(i.currentSrc||i.src).includes('PlatformAssets')).length >= 4`,
    ]);

    // Dismiss any auto-modal (translation, login) that intercepts pointer events.
    browserSafe(['press', 'Escape']);
    browserSafe(['wait', '300']);
    browserSafe(['press', 'Escape']);
    browserSafe(['wait', '300']);

    // Open the full gallery if the button exists; ignore failures.
    const showAll = browserSafe(['find', 'text', 'Show all photos', 'click']);
    if (showAll) {
        browserSafe([
            'wait',
            '--fn',
            `Array.from(document.querySelectorAll('img')).filter(i => (i.currentSrc||i.src).includes('muscache.com/im/pictures/') && !(i.currentSrc||i.src).includes('PlatformAssets')).length >= 10`,
        ]);
        for (let i = 0; i < 5; i++) {
            browserSafe(['scroll', 'down', '1500']);
            browserSafe(['wait', '600']);
        }
    }

    const raw = browserSafe(['eval', '--stdin'], EXTRACT_PHOTO_URLS_JS);
    if (!raw) return [];
    try {
        const inner = JSON.parse(raw.trim()) as string;
        return JSON.parse(inner) as string[];
    } catch {
        return [];
    }
}

async function expandOne(
    sb: ReturnType<typeof createServiceClient>,
    listing: ListingRow,
): Promise<{ uploaded: number }> {
    if (!listing.external_url) return { uploaded: 0 };

    console.log(`    scraping…`);
    const allUrls = await scrapeCandidates(listing.external_url);
    if (allUrls.length === 0) return { uploaded: 0 };

    const picks = allUrls.slice(0, MAX_CANDIDATES).map((u) => bumpResolution(u, 1920));
    console.log(`    found ${allUrls.length} URL(s); uploading ${picks.length}`);

    // Upload in parallel (capped) for speed.
    const uploaded: string[] = [];
    const slots = await Promise.allSettled(
        picks.map(async (url, i) => {
            const buf = await downloadBuffer(url);
            const path = `inside_airbnb/${listing.source_id}/${String(i + 1).padStart(2, '0')}.jpg`;
            return await uploadBuffer(sb, 'listing-photos', path, buf, 'image/jpeg');
        }),
    );
    for (const s of slots) {
        if (s.status === 'fulfilled') uploaded.push(s.value);
    }

    if (uploaded.length === 0) return { uploaded: 0 };
    if (uploaded.length < MIN_USEFUL) {
        console.warn(`    ⚠ only ${uploaded.length} photo(s) usable for this listing`);
    }

    const { error } = await sb
        .from('listings')
        .update({ photo_urls: uploaded })
        .eq('id', listing.id);
    if (error) throw new Error(`update photo_urls: ${error.message}`);
    return { uploaded: uploaded.length };
}

async function main(): Promise<void> {
    const cfg = await loadConfig();
    const sb = createServiceClient(cfg);
    const targetListingId = process.argv[2];

    let q = sb.from('listings').select('id, source_id, external_url, photo_urls');
    if (targetListingId) q = q.eq('id', targetListingId);
    const { data: listings, error } = await q;
    if (error) throw new Error(`select listings: ${error.message}`);
    if (!listings || listings.length === 0) {
        console.log('No matching listings.');
        return;
    }

    console.log(`▸ ${listings.length} listing(s) to (re-)source. Target: up to ${MAX_CANDIDATES} candidates each.`);
    console.log(`  AI photo selection happens at reel-generation time, not here.`);

    let i = 0;
    let total = 0;
    try {
        for (const listing of listings) {
            i++;
            console.log(`\n[${i}/${listings.length}] ${listing.source_id}`);
            try {
                const r = await expandOne(sb, listing as ListingRow);
                console.log(`  ✓ uploaded ${r.uploaded}`);
                total += r.uploaded;
            } catch (err) {
                console.warn(`  ✗ ${listing.source_id}: ${(err as Error).message}`);
            }
        }
    } finally {
        try { browser(['close']); } catch { /* ignore */ }
    }

    console.log(`\n▸ Done — ${total} photo(s) uploaded across ${i} listing(s).`);
}

await main();
