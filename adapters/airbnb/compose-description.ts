export interface AirbnbRow {
    name: string;
    description: string;
    neighborhood_overview: string;
    property_type: string;
    accommodates: string;
    bedrooms: string;
    beds: string;
    bathrooms_text: string;
    amenities: string;       // JSON array as string in CSV
    price: string;
}

export function composeDescription(row: AirbnbRow): string {
    const sections: string[] = [];

    if (row.description?.trim()) {
        sections.push(`### About this place\n${row.description.trim()}`);
    }
    if (row.neighborhood_overview?.trim()) {
        sections.push(`### The neighborhood\n${row.neighborhood_overview.trim()}`);
    }
    const bb = bedsAndBaths(row);
    if (bb) sections.push(`### Beds & baths\n${bb}`);
    const ams = amenitiesList(row.amenities);
    if (ams) sections.push(`### Amenities\n${ams}`);
    if (row.price?.trim()) sections.push(`### Price\n${row.price.trim()} per night`);

    return sections.join('\n\n');
}

function bedsAndBaths(r: AirbnbRow): string | null {
    const parts: string[] = [];
    if (r.bedrooms) parts.push(`${r.bedrooms} bedroom${r.bedrooms === '1' ? '' : 's'}`);
    if (r.beds) parts.push(`${r.beds} bed${r.beds === '1' ? '' : 's'}`);
    if (r.bathrooms_text) parts.push(r.bathrooms_text);
    if (r.accommodates) parts.push(`sleeps ${r.accommodates}`);
    return parts.length ? parts.join(', ') : null;
}

function amenitiesList(raw: string): string | null {
    if (!raw?.trim()) return null;
    try {
        const arr = JSON.parse(raw) as unknown;
        if (!Array.isArray(arr) || arr.length === 0) return null;
        return arr.map((a) => `- ${String(a)}`).join('\n');
    } catch {
        return null;
    }
}
