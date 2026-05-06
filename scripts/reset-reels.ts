#!/usr/bin/env bun
/*
 * Wipe all generated reels back to a fresh state, leaving listings + brand assets intact.
 *
 *   bun run reset:reels
 *
 * Deletes:
 *   - all rows in the `reels` table
 *   - all objects in the `reels/` Storage bucket
 *   - all objects in the `intermediates/` Storage bucket
 *
 * Does NOT touch: listings, listing-photos/, prompts/, brand/.
 */

import { loadConfig } from '../pipeline/config.ts';
import { createServiceClient } from '../pipeline/supabase.ts';

async function emptyBucket(sb: ReturnType<typeof createServiceClient>, bucket: string): Promise<number> {
    let removed = 0;
    // Walk top-level entries; recurse into folders.
    const walk = async (prefix: string): Promise<void> => {
        const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: 1000 });
        if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
        if (!data || data.length === 0) return;
        const fullPaths: string[] = [];
        const subfolders: string[] = [];
        for (const entry of data) {
            const path = prefix ? `${prefix}/${entry.name}` : entry.name;
            // Folders have null id in supabase storage.list output.
            if (entry.id === null) subfolders.push(path);
            else fullPaths.push(path);
        }
        if (fullPaths.length > 0) {
            const { error: delErr } = await sb.storage.from(bucket).remove(fullPaths);
            if (delErr) throw new Error(`remove from ${bucket}: ${delErr.message}`);
            removed += fullPaths.length;
        }
        for (const sub of subfolders) await walk(sub);
    };
    await walk('');
    return removed;
}

async function main(): Promise<void> {
    const cfg = await loadConfig();
    const sb = createServiceClient(cfg);

    console.log('▸ Deleting all rows from `reels`…');
    // Use a guard `id is not null` so Supabase accepts a bulk delete with no other filter.
    const { count, error } = await sb.from('reels').delete({ count: 'exact' }).not('id', 'is', null);
    if (error) throw new Error(`delete reels: ${error.message}`);
    console.log(`  ✓ ${count ?? 0} row(s) deleted`);

    for (const bucket of ['reels', 'intermediates'] as const) {
        console.log(`▸ Emptying \`${bucket}/\` Storage bucket…`);
        const n = await emptyBucket(sb, bucket);
        console.log(`  ✓ ${n} object(s) removed`);
    }

    console.log('\nDone. Listings, brand/, and prompts/ untouched.');
}

await main();
