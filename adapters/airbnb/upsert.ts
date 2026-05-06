import type { SupabaseClient } from '@supabase/supabase-js';
import { uploadBuffer } from '../../pipeline/storage.ts';
import { composeDescription } from './compose-description.ts';
import type { AirbnbListing } from './fetch.ts';

const HERO_RESOLUTION = '?im_w=1920';

export async function upsertAirbnbListing(
    sb: SupabaseClient,
    row: AirbnbListing,
): Promise<{ id: string; uploaded: number }> {
    if (!row.picture_url) throw new Error(`row ${row.id} has no picture_url`);
    const heroUrl = (row.picture_url.split('?')[0] ?? row.picture_url) + HERO_RESOLUTION;
    const r = await fetch(heroUrl);
    if (!r.ok) throw new Error(`download ${heroUrl}: ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    const storagePath = `inside_airbnb/${row.id}/hero.jpg`;
    const publicUrl = await uploadBuffer(sb, 'listing-photos', storagePath, buf, 'image/jpeg');

    const description = composeDescription(row);

    const { data, error } = await sb.from('listings').upsert({
        source: 'inside_airbnb',
        source_id: row.id,
        name: row.name,
        description,
        photo_urls: [publicUrl],
        external_url: row.listing_url,
        city: 'Paris',
        neighborhood: row.neighbourhood_cleansed,
    }, { onConflict: 'source,source_id' }).select('id').single();

    if (error || !data) throw new Error(`upsert ${row.id}: ${error?.message}`);
    return { id: data.id, uploaded: 1 };
}
