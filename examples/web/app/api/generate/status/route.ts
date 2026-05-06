import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getAdmin } from '@/lib/db-admin';

export async function GET(req: NextRequest): Promise<NextResponse> {
    const reelId = req.nextUrl.searchParams.get('reelId');
    if (!reelId) return NextResponse.json({ error: 'reelId required' }, { status: 400 });
    const sb = getAdmin();
    const { data, error } = await sb
        .from('reels')
        .select('id, status, stage, mp4_url, error_msg, duration_s, script_json')
        .eq('id', reelId)
        .single();
    if (error || !data) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json(data);
}
