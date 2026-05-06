import type { SupabaseClient } from '@supabase/supabase-js';
import type { Minimax } from './minimax.ts';
import { uploadBuffer } from './storage.ts';

export const DEFAULT_VOICE_ID = 'English_Trustworth_Man';

export async function generateVoice(
    narration: string,
    voiceId: string,
    minimax: Pick<Minimax, 'speech'>,
    sb: SupabaseClient,
    reelId: string,
): Promise<string> {
    const buf = await minimax.speech(narration, voiceId);
    return uploadBuffer(sb, 'intermediates', `${reelId}/voice.mp3`, buf, 'audio/mpeg');
}
