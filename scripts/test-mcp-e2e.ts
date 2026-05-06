#!/usr/bin/env bun
/*
 * End-to-end MCP test: spawn the server, read the airbnb-marais example brief,
 * call generate_reel with it, wait for the real pipeline to finish, inspect
 * the result.
 *
 * Takes 3-5 minutes (real MiniMax + ffmpeg run). The result is left in DB
 * as source='mcp' — clean up via `bun run reset:mcp`.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';
import { join } from 'node:path';
import { REPO_ROOT } from '../pipeline/paths.ts';

interface RpcMsg { jsonrpc?: '2.0'; id?: number; method?: string; params?: unknown; result?: unknown; error?: unknown; }

class StdioClient {
    private proc: ChildProcess & { stdin: Writable; stdout: Readable };
    private buffer = '';
    private nextId = 1;
    private pending: Map<number, (m: RpcMsg) => void> = new Map();
    constructor(scriptPath: string) {
        const proc = spawn('bun', ['run', scriptPath], { cwd: REPO_ROOT, stdio: ['pipe', 'pipe', 'inherit'] });
        if (!proc.stdin || !proc.stdout) throw new Error('no stdio');
        this.proc = proc as ChildProcess & { stdin: Writable; stdout: Readable };
        this.proc.stdout.on('data', (b: Buffer) => this.onData(b.toString('utf8')));
    }
    private onData(s: string) {
        this.buffer += s;
        let nl: number;
        while ((nl = this.buffer.indexOf('\n')) >= 0) {
            const line = this.buffer.slice(0, nl).trim();
            this.buffer = this.buffer.slice(nl + 1);
            if (!line) continue;
            try {
                const m = JSON.parse(line) as RpcMsg;
                if (typeof m.id === 'number') {
                    const cb = this.pending.get(m.id);
                    if (cb) { this.pending.delete(m.id); cb(m); }
                }
            } catch { /* ignore */ }
        }
    }
    request(method: string, params?: unknown): Promise<RpcMsg> {
        const id = this.nextId++;
        return new Promise((resolve) => {
            this.pending.set(id, resolve);
            this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
        });
    }
    notify(method: string, params?: unknown): void {
        this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
    }
    close(): void { this.proc.kill(); }
}

async function main(): Promise<void> {
    const client = new StdioClient(join(REPO_ROOT, 'mcp', 'server.ts'));
    await client.request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'lensbnb-e2e', version: '0.0.1' } });
    client.notify('notifications/initialized');

    // 1. Read the brief specified by env or default to airbnb-marais
    const target = process.env['LENSBNB_TEST_RESOURCE'] ?? 'lensbnb://example/airbnb-marais';
    console.log(`▸ resources/read ${target}…`);
    const read = await client.request('resources/read', { uri: target });
    const text = (read.result as { contents?: Array<{ text?: string }> })?.contents?.[0]?.text;
    if (!text) throw new Error('no brief text returned');
    const brief = JSON.parse(text) as Record<string, unknown>;
    console.log(`  ✓ "${brief['name']}", ${(brief['photo_urls'] as string[]).length} photos`);

    // 2. Call generate_reel
    console.log('\n▸ tools/call generate_reel — this takes 3-5 minutes…');
    const start = Date.now();
    const call = await client.request('tools/call', { name: 'generate_reel', arguments: { brief } });
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    if (call.error) {
        console.error(`✗ rpc error after ${elapsed}s:`, call.error);
        process.exit(1);
    }
    const callRes = call.result as { isError?: boolean; content?: Array<{ type: string; text: string }> };
    if (callRes?.isError) {
        console.error(`✗ tool error after ${elapsed}s:`, callRes.content?.[0]?.text);
        process.exit(1);
    }

    const payload = callRes?.content?.[0]?.text;
    if (!payload) throw new Error('no payload in tool result');
    const result = JSON.parse(payload) as {
        mp4_url: string;
        duration_s: number;
        caption: string;
        hashtags: string[];
        generation_log: Record<string, unknown>;
    };

    console.log(`\n✅ generated in ${elapsed}s`);
    console.log(`   mp4_url:    ${result.mp4_url}`);
    console.log(`   duration:   ${result.duration_s}s`);
    console.log(`   caption:    "${result.caption.slice(0, 80)}…"`);
    console.log(`   hashtags:   ${result.hashtags.slice(0, 5).join(' ')}`);
    console.log(`   voice:      ${result.generation_log['voice_id']} (${(result.generation_log['voice_rationale'] as string)?.slice(0, 60)}…)`);
    console.log(`   music_mood: ${(result.generation_log['music_mood'] as string)?.slice(0, 60)}…`);
    const ps = result.generation_log['photo_selection'] as { method?: string; chosen_positions?: number[]; rationale?: string };
    console.log(`   photos:     method=${ps?.method}  picks=[${ps?.chosen_positions?.join(',')}]`);
    if (ps?.rationale) console.log(`               "${ps.rationale.slice(0, 80)}…"`);

    client.close();
}

main().catch((err) => {
    console.error('\n❌', (err as Error).message);
    process.exit(1);
});
