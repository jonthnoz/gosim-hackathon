import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile } from 'node:fs/promises';
import { brandingPath } from '@pipeline/paths.ts';

export async function GET(): Promise<NextResponse> {
    const c = await readFile(brandingPath(), 'utf8');
    return NextResponse.json(JSON.parse(c));
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
    const body = await req.json();
    if (!body || typeof body !== 'object' || !body.watermark) {
        return NextResponse.json({ error: 'invalid shape' }, { status: 400 });
    }
    await writeFile(brandingPath(), JSON.stringify(body, null, 2), 'utf8');
    return NextResponse.json({ ok: true });
}
