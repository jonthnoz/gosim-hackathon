import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getAdmin } from '@/lib/db-admin';
import { startGeneration } from '@/lib/start-generation';
import { runPipeline } from '@pipeline/run';

export const runtime = 'nodejs';
export const maxDuration = 600;

export async function POST(req: NextRequest): Promise<NextResponse> {
    const body = await req.json() as { listingId?: string };
    if (!body.listingId) return NextResponse.json({ error: 'listingId required' }, { status: 400 });
    const sb = getAdmin();
    const res = await startGeneration(sb, body.listingId);
    if (res.startedNew) {
        // Fire-and-forget — local Node runtime keeps the unawaited promise alive.
        void runPipeline(res.reelId).catch((err) => {
            console.error(`pipeline ${res.reelId} failed:`, err);
        });
    }
    return NextResponse.json(res);
}
