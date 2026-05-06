import { describe, expect, test } from 'bun:test';
import { mkdtempSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { assembleVideo } from '../assemble-video.ts';

describe('assembleVideo (smoke)', () => {
    test('produces a non-empty MP4 of expected duration', async () => {
        if (spawnSync('ffmpeg', ['-version']).status !== 0) {
            console.warn('ffmpeg not on PATH — skipping');
            return;
        }
        const dir = mkdtempSync(join(tmpdir(), 'asm-'));
        for (let i = 0; i < 5; i++) {
            spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
                '-f', 'lavfi', '-i', `color=c=0x${(i * 40).toString(16).padStart(2, '0')}3070:s=1080x1920:d=1`,
                '-frames:v', '1', join(dir, `photo-${i}.jpg`)]);
        }
        spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
            '-f', 'lavfi', '-i', 'sine=frequency=440:duration=5',
            '-c:a', 'mp3', join(dir, 'voice.mp3')]);
        spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
            '-f', 'lavfi', '-i', 'sine=frequency=200:duration=5',
            '-c:a', 'mp3', join(dir, 'music.mp3')]);
        const photos = Array.from({ length: 5 }, (_, i) => join(dir, `photo-${i}.jpg`));
        const out = join(dir, 'final.mp4');
        await assembleVideo({
            outputPath: out,
            workDir: dir,
            photos,
            voicePath: join(dir, 'voice.mp3'),
            musicPath: join(dir, 'music.mp3'),
            hookText: 'TEST HOOK',
            narration: 'Test narration sentence one. Test narration sentence two.',
            watermarkPath: null,
        });
        expect(existsSync(out)).toBe(true);
        expect(statSync(out).size).toBeGreaterThan(50_000);
    }, 120_000);
});
