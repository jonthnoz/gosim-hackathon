#!/usr/bin/env bun
/*
 * Cleanup script for MCP-driven generations.
 *
 * Deletes ONLY:
 *   - listings rows where source = 'mcp'           (synthetic briefs)
 *   - reels for those listings (cascades)
 *   - their MP4s in the `reels/` Storage bucket
 *   - their intermediates (voice/music/cards)
 *
 * Does NOT touch:
 *   - listings where source = 'inside_airbnb' (your real Paris dataset)
 *   - their reels in `reels/` bucket
 *   - listing-photos / brand / prompts
 */

import { loadConfig } from '../pipeline/config.ts';
import { createServiceClient } from '../pipeline/supabase.ts';

async function main(): Promise<void> {
    const cfg = await loadConfig();
    const sb = createServiceClient(cfg);

    // 1. Find MCP-source listings + their reels (we'll need the reel ids for storage cleanup)
    const { data: mcpListings } = await sb
        .from('listings')
        .select('id, source_id')
        .eq('source', 'mcp');
    if (!mcpListings || mcpListings.length === 0) {
        console.log('No source=mcp listings — nothing to clean.');
        return;
    }
    console.log(`▸ Found ${mcpListings.length} mcp-sourced listing(s)`);

    const listingIds = mcpListings.map((l) => l.id as string);
    const { data: reels } = await sb.from('reels').select('id').in('listing_id', listingIds);
    const reelIds = (reels ?? []).map((r) => r.id as string);
    console.log(`▸ Their reels: ${reelIds.length}`);

    // 2. Storage cleanup: reels/<reelId>.mp4 + intermediates/<reelId>/...
    for (const reelId of reelIds) {
        await sb.storage.from('reels').remove([`${reelId}.mp4`]).catch(() => null);
        const { data: inter } = await sb.storage.from('intermediates').list(reelId, { limit: 100 });
        if (inter && inter.length > 0) {
            const paths = inter.map((f) => `${reelId}/${f.name}`);
            await sb.storage.from('intermediates').remove(paths).catch(() => null);
        }
    }
    console.log(`▸ Storage cleaned for ${reelIds.length} reel(s)`);

    // 3. Delete listings (reels cascade via FK)
    const { error: delErr, count } = await sb
        .from('listings')
        .delete({ count: 'exact' })
        .eq('source', 'mcp');
    if (delErr) throw new Error(`delete: ${delErr.message}`);
    console.log(`▸ Deleted ${count ?? mcpListings.length} mcp listing(s) (reels cascaded)`);

    console.log('\nDone. inside_airbnb listings + their reels untouched.');
}

await main();
