import 'server-only';
import { NextResponse } from 'next/server';
import { readdir } from 'node:fs/promises';
import { promptsDir } from '@pipeline/paths.ts';

export async function GET(): Promise<NextResponse> {
    const all = await readdir(promptsDir());
    const files = all.filter((f) => /^[a-z0-9-]+\.md$/.test(f));
    return NextResponse.json({ files });
}
