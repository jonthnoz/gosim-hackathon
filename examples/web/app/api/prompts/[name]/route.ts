import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile } from 'node:fs/promises';
import { promptPath } from '@pipeline/paths.ts';

const NAME_RE = /^[a-z0-9-]+$/;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ name: string }> }): Promise<NextResponse> {
    const { name } = await ctx.params;
    if (!NAME_RE.test(name)) return NextResponse.json({ error: 'invalid name' }, { status: 400 });
    const content = await readFile(promptPath(name), 'utf8');
    return NextResponse.json({ name, content });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ name: string }> }): Promise<NextResponse> {
    const { name } = await ctx.params;
    if (!NAME_RE.test(name)) return NextResponse.json({ error: 'invalid name' }, { status: 400 });
    const body = await req.json() as { content?: string };
    if (typeof body.content !== 'string') return NextResponse.json({ error: 'content required' }, { status: 400 });
    await writeFile(promptPath(name), body.content, 'utf8');
    return NextResponse.json({ ok: true });
}
