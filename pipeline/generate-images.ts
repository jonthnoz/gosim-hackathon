import type { SupabaseClient } from '@supabase/supabase-js';
import type { Minimax } from './minimax.ts';
import type { Script } from './types.ts';
import { uploadBuffer } from './storage.ts';

export interface ReelCards {
    titleUrl: string;
    lifestyleUrl: string;
    endUrl: string;
}

export async function generateCards(
    script: Script,
    minimax: Pick<Minimax, 'image'>,
    sb: SupabaseClient,
    reelId: string,
): Promise<ReelCards> {
    const [titleSrc, lifestyleSrc, endSrc] = await Promise.all([
        minimax.image(script.titleCardPrompt),
        minimax.image(script.lifestylePrompt),
        minimax.image(script.endCardPrompt),
    ]);
    const fetchBuf = async (url: string): Promise<Buffer> => {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`download failed (${r.status}): ${url}`);
        return Buffer.from(await r.arrayBuffer());
    };
    const [titleBuf, lifestyleBuf, endBuf] = await Promise.all([
        fetchBuf(titleSrc), fetchBuf(lifestyleSrc), fetchBuf(endSrc),
    ]);
    const [titleUrl, lifestyleUrl, endUrl] = await Promise.all([
        uploadBuffer(sb, 'intermediates', `${reelId}/card-title.jpg`, titleBuf, 'image/jpeg'),
        uploadBuffer(sb, 'intermediates', `${reelId}/card-lifestyle.jpg`, lifestyleBuf, 'image/jpeg'),
        uploadBuffer(sb, 'intermediates', `${reelId}/card-end.jpg`, endBuf, 'image/jpeg'),
    ]);
    return { titleUrl, lifestyleUrl, endUrl };
}
