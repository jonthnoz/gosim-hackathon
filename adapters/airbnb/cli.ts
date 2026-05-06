#!/usr/bin/env bun
import { loadConfig } from '../../pipeline/config.ts';
import { createServiceClient } from '../../pipeline/supabase.ts';
import { fetchAirbnbCsv } from './fetch.ts';
import { upsertAirbnbListing } from './upsert.ts';

const SNAPSHOT_DATE = process.env['INSIDE_AIRBNB_SNAPSHOT_DATE'] ?? '2025-09-12';
const COUNT = Number(process.argv[2] ?? 20);

async function main(): Promise<void> {
    const cfg = await loadConfig();
    const sb = createServiceClient(cfg);

    console.log(`▸ Fetching Inside Airbnb Paris CSV (${SNAPSHOT_DATE})…`);
    const all = await fetchAirbnbCsv(SNAPSHOT_DATE);
    console.log(`  ${all.length} rows total`);

    const withHero = all.filter((r) => r.picture_url?.startsWith('http') && r.name && r.neighbourhood_cleansed);
    const seen = new Set<string>();
    const picks = [];
    for (const r of withHero) {
        if (picks.length >= COUNT) break;
        if (seen.has(r.neighbourhood_cleansed)) continue;
        seen.add(r.neighbourhood_cleansed);
        picks.push(r);
    }
    for (const r of withHero) {
        if (picks.length >= COUNT) break;
        if (picks.includes(r)) continue;
        picks.push(r);
    }

    console.log(`▸ Upserting ${picks.length} listings…`);
    for (const row of picks) {
        try {
            const res = await upsertAirbnbListing(sb, row);
            console.log(`  ✓ ${row.id} → listings/${res.id}`);
        } catch (err) {
            console.warn(`  ✗ ${row.id}: ${(err as Error).message}`);
        }
    }
}

await main();
