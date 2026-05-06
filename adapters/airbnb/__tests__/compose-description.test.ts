import { describe, expect, test } from 'bun:test';
import { composeDescription } from '../compose-description.ts';

const sample = {
    name: 'Marais loft',
    description: 'Original beams. Tall windows.',
    neighborhood_overview: 'Quiet street near Place des Vosges.',
    property_type: 'Entire loft',
    accommodates: '2',
    bedrooms: '1',
    beds: '1',
    bathrooms_text: '1 bath',
    amenities: '["Wifi","Kitchen","Washer"]',
    price: '$180.00',
};

describe('composeDescription', () => {
    test('emits a sectioned markdown blob', () => {
        const md = composeDescription(sample);
        expect(md).toContain('### About this place');
        expect(md).toContain('Original beams. Tall windows.');
        expect(md).toContain('### The neighborhood');
        expect(md).toContain('Place des Vosges');
        expect(md).toContain('### Beds & baths');
        expect(md).toContain('1 bedroom');
        expect(md).toContain('### Amenities');
        expect(md).toContain('Wifi');
    });

    test('omits sections with empty source data', () => {
        const md = composeDescription({ ...sample, neighborhood_overview: '', amenities: '[]' });
        expect(md).not.toContain('### The neighborhood');
        expect(md).not.toContain('### Amenities');
    });

    test('parses amenities JSON array safely', () => {
        const md = composeDescription({ ...sample, amenities: 'not-json' });
        expect(md).not.toContain('### Amenities');
    });
});
