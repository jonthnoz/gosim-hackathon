// Helper: download a list of image URLs to disk, compute an 8x8 grayscale
// signature for each via ffmpeg, and return the candidates. Used by the
// pipeline's photo-selection step at reel-generation time.

import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PhotoCandidate } from './select-photos.ts';

function probeDimensions(localPath: string): { width: number; height: number } {
    const proc = spawnSync(
        'ffprobe',
        ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', localPath],
        { encoding: 'utf8' },
    );
    if (proc.status !== 0) return { width: 0, height: 0 };
    const [w, h] = proc.stdout.trim().split(',').map((n) => parseInt(n, 10));
    return { width: w ?? 0, height: h ?? 0 };
}

function computeSignature(localPath: string): string {
    const proc = spawnSync(
        'ffmpeg',
        ['-hide_banner', '-loglevel', 'error', '-i', localPath, '-vf', 'scale=8:8,format=gray', '-frames:v', '1', '-f', 'rawvideo', '-'],
        { encoding: 'buffer', maxBuffer: 1024 * 1024 },
    );
    if (proc.status !== 0) {
        throw new Error(`ffmpeg signature failed: ${proc.stderr?.toString() ?? ''}`);
    }
    return Buffer.from(proc.stdout).toString('hex');
}

export interface SignedPhoto {
    candidate: PhotoCandidate;
    localPath: string;       // for downstream ffmpeg use (avoids re-downloading)
    buffer: Buffer;          // in case caller wants to upload elsewhere
}

/**
 * Download each URL to `workDir`, probe dimensions + compute signature.
 * Returns parallel arrays of candidates + local paths so the caller can hand
 * the local paths off to assemble-video.ts directly without re-fetching.
 */
// Some CDNs (notably Wikimedia) require a polite User-Agent or rate-limit anon traffic.
const FETCH_HEADERS = { 'User-Agent': 'Lensbnb/0.1 (https://github.com/lensbnb; demo)' };

export async function fetchAndSignPhotos(urls: string[], workDir: string): Promise<SignedPhoto[]> {
    const out: SignedPhoto[] = [];
    for (let i = 0; i < urls.length; i++) {
        const url = urls[i]!;
        try {
            const r = await fetch(url, { headers: FETCH_HEADERS });
            if (!r.ok) throw new Error(`download ${r.status}`);
            const buffer = Buffer.from(await r.arrayBuffer());
            const localPath = join(workDir, `cand-${String(i + 1).padStart(2, '0')}.jpg`);
            await writeFile(localPath, buffer);
            const { width, height } = probeDimensions(localPath);
            const signatureHex = computeSignature(localPath);
            out.push({
                candidate: { position: i + 1, width, height, signatureHex, url },
                localPath,
                buffer,
            });
        } catch (err) {
            // Skip broken entries; selection logic handles partial sets fine.
            console.warn(`  ✗ candidate ${i + 1} (${url.slice(0, 60)}…): ${(err as Error).message}`);
        }
    }
    return out;
}
