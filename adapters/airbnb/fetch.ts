import { gunzipSync } from 'node:zlib';
import { parse } from 'csv-parse/sync';
import type { AirbnbRow } from './compose-description.ts';

export interface AirbnbListing extends AirbnbRow {
    id: string;
    listing_url: string;
    picture_url: string;
    neighbourhood_cleansed: string;
}

const CITY_PATH = 'france/ile-de-france/paris';

export async function fetchAirbnbCsv(snapshotDate: string): Promise<AirbnbListing[]> {
    const url = `https://data.insideairbnb.com/${CITY_PATH}/${snapshotDate}/data/listings.csv.gz`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Inside Airbnb fetch failed: ${r.status}`);
    const csv = gunzipSync(Buffer.from(await r.arrayBuffer())).toString('utf8');
    return parse(csv, { columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true }) as AirbnbListing[];
}
