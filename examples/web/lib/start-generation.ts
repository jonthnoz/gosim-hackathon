import type { SupabaseClient } from '@supabase/supabase-js';

export interface StartResult {
    reelId: string;
    startedNew: boolean;
    status: 'pending' | 'running';
}

export async function startGeneration(sb: SupabaseClient, listingId: string): Promise<StartResult> {
    // 1. Check for an existing active reel
    const existing = await sb
        .from('reels')
        .select('id')
        .eq('listing_id', listingId)
        .in('status', ['pending', 'running'])
        .maybeSingle();
    if (existing.error) throw new Error(`select active: ${existing.error.message}`);
    if (existing.data) return { reelId: existing.data.id, startedNew: false, status: 'running' };

    // 2. Insert new
    const ins = await sb
        .from('reels')
        .insert({ listing_id: listingId, status: 'pending' })
        .select('id')
        .single();

    if (ins.error?.code === '23505') {
        // 3. Race: another request beat us. Return the winner.
        const again = await sb
            .from('reels')
            .select('id')
            .eq('listing_id', listingId)
            .in('status', ['pending', 'running'])
            .maybeSingle();
        if (again.data) return { reelId: again.data.id, startedNew: false, status: 'running' };
        throw new Error(`unique violation but no active reel found for listing ${listingId}`);
    }
    if (ins.error || !ins.data) throw new Error(`insert reel: ${ins.error?.message}`);
    return { reelId: ins.data.id, startedNew: true, status: 'pending' };
}
