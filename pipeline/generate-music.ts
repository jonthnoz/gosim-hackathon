import type { SupabaseClient } from '@supabase/supabase-js';
import type { Minimax } from './minimax.ts';
import { uploadBuffer } from './storage.ts';

export async function generateMusic(
    musicPrompt: string,
    minimax: Pick<Minimax, 'music'>,
    sb: SupabaseClient,
    reelId: string,
): Promise<string> {
    const buf = await minimax.music(musicPrompt);
    return uploadBuffer(sb, 'intermediates', `${reelId}/music.mp3`, buf, 'audio/mpeg');
}
