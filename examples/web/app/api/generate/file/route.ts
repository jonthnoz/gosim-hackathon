import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getAdmin } from '@/lib/db-admin';

export async function GET(req: NextRequest): Promise<NextResponse> {
    const reelId = req.nextUrl.searchParams.get('reelId');
    if (!reelId) return NextResponse.json({ error: 'reelId required' }, { status: 400 });
    const sb = getAdmin();
    const { data } = await sb.from('reels').select('mp4_url').eq('id', reelId).single();
    if (!data?.mp4_url) return NextResponse.json({ error: 'no mp4 yet' }, { status: 404 });
    return NextResponse.redirect(data.mp4_url);
}
