#!/usr/bin/env bun
/*
 * Smoke-test the MCP server lifecycle: spawn, initialize, list tools/resources/prompts,
 * read one resource, get one prompt. No real `generate_reel` invocation here — that's
 * the e2e test (separate script).
 */

import { spawn, type ChildProcess } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';
import { join } from 'node:path';
import { REPO_ROOT } from '../pipeline/paths.ts';

interface RpcMsg {
    jsonrpc?: '2.0';
    id?: number;
    method?: string;
    params?: unknown;
    result?: unknown;
    error?: unknown;
}

class StdioClient {
    private proc: ChildProcess & { stdin: Writable; stdout: Readable };
    private buffer = '';
    private nextId = 1;
    private pending: Map<number, (msg: RpcMsg) => void> = new Map();

    constructor(serverScript: string) {
        const proc = spawn('bun', ['run', serverScript], {
            cwd: REPO_ROOT,
            stdio: ['pipe', 'pipe', 'inherit'],
        });
        if (!proc.stdin || !proc.stdout) throw new Error('failed to open stdio pipes');
        this.proc = proc as ChildProcess & { stdin: Writable; stdout: Readable };
        this.proc.stdout.on('data', (chunk: Buffer) => this.onData(chunk.toString('utf8')));
    }

    private onData(s: string) {
        this.buffer += s;
        let nl: number;
        while ((nl = this.buffer.indexOf('\n')) >= 0) {
            const line = this.buffer.slice(0, nl).trim();
            this.buffer = this.buffer.slice(nl + 1);
            if (!line) continue;
            try {
                const msg = JSON.parse(line) as RpcMsg;
                if (typeof msg.id === 'number') {
                    const cb = this.pending.get(msg.id);
                    if (cb) {
                        this.pending.delete(msg.id);
                        cb(msg);
                    }
                }
            } catch (err) {
                console.error('parse error:', line, err);
            }
        }
    }

    request(method: string, params?: unknown): Promise<RpcMsg> {
        const id = this.nextId++;
        const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params });
        return new Promise((resolve) => {
            this.pending.set(id, resolve);
            this.proc.stdin.write(msg + '\n');
        });
    }

    notify(method: string, params?: unknown): void {
        const msg = JSON.stringify({ jsonrpc: '2.0', method, params });
        this.proc.stdin.write(msg + '\n');
    }

    close(): void {
        this.proc.kill();
    }
}

async function main(): Promise<void> {
    const client = new StdioClient(join(REPO_ROOT, 'mcp', 'server.ts'));

    // Step 1: initialize
    const init = await client.request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'lensbnb-test', version: '0.0.1' },
    });
    console.log('▸ initialize:', JSON.stringify((init.result as { serverInfo?: unknown })?.serverInfo));
    client.notify('notifications/initialized');

    // Step 2: tools/list
    const tools = await client.request('tools/list');
    const toolList = (tools.result as { tools?: Array<{ name: string }> })?.tools ?? [];
    console.log(`▸ tools/list: ${toolList.length} tool(s)`);
    for (const t of toolList) console.log(`    • ${t.name}`);
    if (toolList.length !== 1 || toolList[0]?.name !== 'generate_reel') {
        throw new Error(`expected 1 tool 'generate_reel', got ${JSON.stringify(toolList.map((t) => t.name))}`);
    }

    // Step 3: resources/list
    const resources = await client.request('resources/list');
    const resList = (resources.result as { resources?: Array<{ uri: string }> })?.resources ?? [];
    console.log(`▸ resources/list: ${resList.length} resource(s)`);
    for (const r of resList) console.log(`    • ${r.uri}`);
    if (resList.length !== 4) throw new Error(`expected 4 resources, got ${resList.length}`);

    // Step 4: resources/read on the airbnb-marais one
    const read = await client.request('resources/read', { uri: 'lensbnb://example/airbnb-marais' });
    const contents = (read.result as { contents?: Array<{ text?: string }> })?.contents ?? [];
    if (contents.length === 0 || !contents[0]?.text) throw new Error('resources/read returned no contents');
    const parsed = JSON.parse(contents[0].text) as { name?: string; photo_urls?: string[] };
    console.log(`▸ resources/read airbnb-marais: name="${parsed.name}", ${parsed.photo_urls?.length ?? 0} photos`);
    if (!parsed.name || !parsed.photo_urls?.length) throw new Error('airbnb-marais brief missing required fields');

    // Step 5: prompts/list
    const prompts = await client.request('prompts/list');
    const promptList = (prompts.result as { prompts?: Array<{ name: string }> })?.prompts ?? [];
    console.log(`▸ prompts/list: ${promptList.length} prompt(s)`);
    for (const p of promptList) console.log(`    • ${p.name}`);

    // Step 6: prompts/get compose_brief
    const get = await client.request('prompts/get', {
        name: 'compose_brief',
        arguments: { topic: 'a Tokyo ramen shop', style: 'warm and personal' },
    });
    const messages = (get.result as { messages?: Array<{ role: string; content?: { text?: string } }> })?.messages ?? [];
    console.log(`▸ prompts/get compose_brief: ${messages.length} message(s) returned`);
    if (messages.length === 0) throw new Error('compose_brief returned no messages');
    if (!messages[0]?.content?.text?.includes('Tokyo ramen')) {
        throw new Error('compose_brief did not interpolate the topic');
    }

    // Step 7: error path — call unknown tool
    const bad = await client.request('tools/call', { name: 'no_such_tool', arguments: {} });
    const isError = Boolean((bad.result as { isError?: boolean })?.isError) || bad.error !== undefined;
    console.log(`▸ tools/call unknown: error=${isError ? '✓' : '✗'}`);
    if (!isError) throw new Error('expected error for unknown tool, got success');

    console.log('\n✅ all stage-1 lifecycle checks pass');
    client.close();
}

main().catch((err) => {
    console.error('\n❌', (err as Error).message);
    process.exit(1);
});
