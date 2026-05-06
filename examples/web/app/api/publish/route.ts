import 'server-only';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest): Promise<NextResponse> {
    const body = await req.json() as { reelId?: string; platform?: 'instagram' | 'tiktok' };
    if (!body.reelId) return NextResponse.json({ error: 'reelId required' }, { status: 400 });
    return NextResponse.json({
        posted: true,
        mock: true,
        platform: body.platform ?? 'instagram',
        handle: '@lensbnb_demo',
        message: `Posted reel ${body.reelId} to @lensbnb_demo on ${body.platform ?? 'Instagram'} (mock).`,
    });
}
