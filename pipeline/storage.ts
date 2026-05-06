import type { SupabaseClient } from '@supabase/supabase-js';

export async function uploadBuffer(
    sb: SupabaseClient,
    bucket: string,
    path: string,
    body: Buffer,
    contentType: string,
): Promise<string> {
    const { error } = await sb.storage.from(bucket).upload(path, body, {
        contentType,
        upsert: true,
    });
    if (error) throw new Error(`Upload to ${bucket}/${path} failed: ${error.message}`);
    const { data } = sb.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
}
