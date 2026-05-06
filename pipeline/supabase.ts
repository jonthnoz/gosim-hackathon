import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Config } from './config.ts';

export function createServiceClient(cfg: Config): SupabaseClient {
    return createClient(cfg.supabaseUrl, cfg.supabaseServiceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
}
