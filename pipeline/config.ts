import { readFile } from 'node:fs/promises';
import { envPath } from './paths.ts';

export interface Config {
    minimaxApiKey: string;
    minimaxBaseUrl: string;
    supabaseUrl: string;
    supabaseServiceRoleKey: string;
    supabaseAnonKey: string;
}

export async function loadConfig(): Promise<Config> {
    const env = await readFile(envPath(), 'utf8').catch(() => '');
    const map: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
        if (v !== undefined) map[k] = v;
    }
    for (const line of env.split('\n')) {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m && m[1] && m[2] !== undefined && map[m[1]] === undefined) map[m[1]] = m[2];
    }
    const need = (k: string): string => {
        const v = map[k];
        if (v === undefined) throw new Error(`Missing env: ${k}`);
        return v;
    };
    return {
        minimaxApiKey: need('MINIMAX_API_KEY'),
        minimaxBaseUrl: map['MINIMAX_BASE_URL'] ?? 'https://api.minimax.io',
        supabaseUrl: need('SUPABASE_URL'),
        supabaseServiceRoleKey: need('SUPABASE_SERVICE_ROLE_KEY'),
        supabaseAnonKey: need('SUPABASE_ANON_KEY'),
    };
}
