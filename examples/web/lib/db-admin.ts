import 'server-only';
import { createClient } from '@supabase/supabase-js';
const url = process.env['SUPABASE_URL']!;
const srk = process.env['SUPABASE_SERVICE_ROLE_KEY']!;
export function getAdmin() {
    return createClient(url, srk, { auth: { persistSession: false } });
}
