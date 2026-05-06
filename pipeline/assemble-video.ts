/*
 * pipeline/assemble-video.ts
 *
 * Reusable ffmpeg orchestration lifted verbatim from
 * scripts/probe-kenburns-reel.ts (the validated probe). The probe stays the
 * source of truth for filter strings — do not refactor for elegance here.
 *
 * Assembles a 9:16 Ken-Burns reel from a sequence of stills, narration and
 * (optionally) a music bed plus a watermark image:
 *   1. Per-image Ken-Burns clip (1080x1920, 30fps, libx264 CRF 20).
 *   2. Cross-faded concat between successive clips.
 *   3. drawtext-burned hook + per-segment captions (Arial).
 *   4. Optional logo/watermark overlay pass.
 *   5. Voice + music mix (loudnorm voice, music ducked to MUSIC_VOL).
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// ---------- constants ----------

const VIDEO_W = 1080;
const VIDEO_H = 1920;
const VIDEO_FPS = 30;
const VIDEO_CRF = '20';
const CROSSFADE_S = 0.55;
const MUSIC_VOL = 0.32;
const HOOK_FONTSIZE = 92;
const HOOK_WRAP_CHARS = 13;
const CAPTION_FONTSIZE = 54;
const CAPTION_WRAP_CHARS = 30;
const CAPTION_LEAD_DELAY = 0.4;
const FONT_PATH = '/System/Library/Fonts/Supplemental/Arial.ttf';

// ---------- public API ----------

export interface AssembleOptions {
    outputPath: string;
    workDir: string;
    photos: string[];
    voicePath: string;
    musicPath: string | null;
    hookText: string;
    narration: string;
    watermarkPath: string | null;
    watermarkCorner?: 'TR' | 'TL' | 'BR' | 'BL';
    watermarkOpacity?: number;
    watermarkMarginPx?: number;
}

// ---------- ffmpeg helpers (lifted from probe) ----------

function runFfmpeg(args: string[], cwd?: string): Promise<void> {
    return new Promise((resolveP, rejectP) => {
        const proc = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], {
            stdio: ['ignore', 'inherit', 'pipe'],
            ...(cwd ? { cwd } : {}),
        });
        let stderr = '';
        proc.stderr.on('data', (d) => {
            stderr += d.toString();
        });
        proc.on('close', (code) => {
            if (code !== 0) rejectP(new Error(`ffmpeg exited ${code}: ${stderr.slice(-800)}`));
            else resolveP();
        });
        proc.on('error', rejectP);
    });
}

function detectLeadSilence(voicePath: string, fallback: number): Promise<number> {
    return new Promise((resolveP) => {
        const proc = spawn('ffmpeg', [
            '-hide_banner',
            '-i', voicePath,
            '-af', 'silencedetect=noise=-30dB:d=0.05',
            '-f', 'null',
            '-',
        ]);
        let stderr = '';
        proc.stderr.on('data', (d) => {
            stderr += d.toString();
        });
        proc.on('close', () => {
            const m = stderr.match(/silence_end:\s*([\d.]+)/);
            if (m) {
                const t = parseFloat(m[1]!);
                if (Number.isFinite(t) && t > 0 && t < 2.0) {
                    resolveP(t);
                    return;
                }
            }
            resolveP(fallback);
        });
        proc.on('error', () => resolveP(fallback));
    });
}

function ffprobeDuration(file: string): Promise<number> {
    return new Promise((resolveP, rejectP) => {
        const proc = spawn('ffprobe', [
            '-v',
            'error',
            '-show_entries',
            'format=duration',
            '-of',
            'default=noprint_wrappers=1:nokey=1',
            file,
        ]);
        let stdout = '';
        proc.stdout.on('data', (d) => {
            stdout += d.toString();
        });
        proc.on('close', () => {
            const n = parseFloat(stdout.trim());
            if (Number.isFinite(n) && n > 0) resolveP(n);
            else rejectP(new Error(`ffprobe failed on ${file}`));
        });
        proc.on('error', rejectP);
    });
}

async function kenBurnsClip(
    imagePath: string,
    outPath: string,
    duration: number,
    variant: number,
): Promise<void> {
    const frames = Math.ceil(duration * VIDEO_FPS);
    const zoomRate = (0.25 / frames).toFixed(6);
    const panRate = Math.ceil((2 * duration) / 8);
    const variants = [
        // 0: zoom-in centered
        `scale=8000:-1,zoompan=z='min(zoom+${zoomRate},1.25)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${VIDEO_W}x${VIDEO_H}:fps=${VIDEO_FPS}`,
        // 1: zoom-out centered
        `scale=8000:-1,zoompan=z='if(eq(on,1),1.25,max(zoom-${zoomRate},1))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${VIDEO_W}x${VIDEO_H}:fps=${VIDEO_FPS}`,
        // 2: pan right while gently zooming
        `scale=8000:-1,zoompan=z='min(zoom+${zoomRate},1.25)':x='if(eq(on,1),0,min(x+${panRate},iw-iw/zoom))':y='ih/2-(ih/zoom/2)':d=${frames}:s=${VIDEO_W}x${VIDEO_H}:fps=${VIDEO_FPS}`,
        // 3: pan left while gently zooming
        `scale=8000:-1,zoompan=z='min(zoom+${zoomRate},1.25)':x='if(eq(on,1),iw,max(x-${panRate},0))':y='ih/2-(ih/zoom/2)':d=${frames}:s=${VIDEO_W}x${VIDEO_H}:fps=${VIDEO_FPS}`,
    ] as const;
    const filter = variants[variant % variants.length]!;
    await runFfmpeg([
        '-loop', '1',
        '-t', String(duration),
        '-i', imagePath,
        '-filter_complex', filter + '[v]',
        '-map', '[v]',
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', VIDEO_CRF,
        '-r', String(VIDEO_FPS),
        '-t', String(duration),
        '-pix_fmt', 'yuv420p',
        outPath,
    ]);
}

async function concatXfade(clips: string[], outPath: string): Promise<number[]> {
    if (clips.length === 0) throw new Error('No clips');
    if (clips.length === 1) {
        await runFfmpeg(['-i', clips[0]!, '-c', 'copy', outPath]);
        return [];
    }
    const durations: number[] = [];
    for (const c of clips) durations.push(await ffprobeDuration(c));
    const filterParts: string[] = [];
    const transitions: number[] = [];
    let prevLabel = '[0:v]';
    let cumul = 0;
    for (let i = 1; i < clips.length; i++) {
        cumul += durations[i - 1]! - CROSSFADE_S;
        const offset = Math.max(0, cumul);
        const out = i < clips.length - 1 ? `[xf${i}]` : '[vout]';
        filterParts.push(
            `${prevLabel}[${i}:v]xfade=transition=fade:duration=${CROSSFADE_S}:offset=${offset.toFixed(3)}${out}`,
        );
        prevLabel = out;
        transitions.push(offset + CROSSFADE_S / 2);
    }
    const inputs: string[] = [];
    for (const c of clips) inputs.push('-i', c);
    await runFfmpeg([
        ...inputs,
        '-filter_complex', filterParts.join(';'),
        '-map', '[vout]',
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', VIDEO_CRF,
        '-r', String(VIDEO_FPS),
        '-pix_fmt', 'yuv420p',
        '-an',
        outPath,
    ]);
    return transitions;
}

function wrapText(text: string, maxChars: number): string {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
        if (!cur) cur = w;
        else if (cur.length + 1 + w.length <= maxChars) cur += ' ' + w;
        else {
            lines.push(cur);
            cur = w;
        }
    }
    if (cur) lines.push(cur);
    return lines.join('\n');
}

function splitForCaptions(narration: string, totalSeconds: number): { start: number; end: number; text: string }[] {
    const sentences = narration
        .split(/(?<=[.!?…])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
    if (sentences.length === 0) return [];
    const wordCounts = sentences.map((s) => s.split(/\s+/).length);
    const totalWords = wordCounts.reduce((a, b) => a + b, 0);
    let cursor = 0;
    return sentences.map((s, i) => {
        const dur = (wordCounts[i]! / totalWords) * totalSeconds;
        const seg = { start: cursor, end: cursor + dur, text: s };
        cursor += dur;
        return seg;
    });
}

interface CaptionPlan {
    hookFile: string;
    segments: { file: string; start: number; end: number }[];
}

async function writeCaptionFiles(
    outDir: string,
    hookText: string,
    segments: { start: number; end: number; text: string }[],
): Promise<CaptionPlan> {
    const hookFile = 'cap_hook.txt';
    await writeFile(join(outDir, hookFile), wrapText(hookText.toUpperCase(), HOOK_WRAP_CHARS));
    const segFiles: { file: string; start: number; end: number }[] = [];
    for (let i = 0; i < segments.length; i++) {
        const s = segments[i]!;
        const file = `cap_${String(i).padStart(2, '0')}.txt`;
        await writeFile(join(outDir, file), wrapText(s.text, CAPTION_WRAP_CHARS));
        segFiles.push({ file, start: s.start, end: s.end });
    }
    return { hookFile, segments: segFiles };
}

async function burnSubs(
    videoIn: string,
    plan: CaptionPlan,
    videoOut: string,
    cwd: string,
): Promise<void> {
    const videoInRel = videoIn.startsWith(cwd) ? videoIn.slice(cwd.length).replace(/^[\\/]/, '') : videoIn;
    const videoOutRel = videoOut.startsWith(cwd) ? videoOut.slice(cwd.length).replace(/^[\\/]/, '') : videoOut;

    const fontEsc = FONT_PATH.replace(/:/g, '\\:');
    const hookFilter = [
        `drawtext=fontfile=${fontEsc}`,
        `textfile=${plan.hookFile}`,
        `fontsize=${HOOK_FONTSIZE}`,
        `fontcolor=white`,
        `bordercolor=black@0.9`,
        `borderw=5`,
        `line_spacing=10`,
        `x='max(60,min(w-text_w-60,(w-text_w)/2))'`,
        `y=h*0.22`,
        `enable='between(t,0,2.6)'`,
    ].join(':');

    const segFilters = plan.segments.map((s) =>
        [
            `drawtext=fontfile=${fontEsc}`,
            `textfile=${s.file}`,
            `fontsize=${CAPTION_FONTSIZE}`,
            `fontcolor=white`,
            `bordercolor=black@0.85`,
            `borderw=3`,
            `box=1`,
            `boxcolor=black@0.45`,
            `boxborderw=14`,
            `line_spacing=8`,
            `x='max(60,min(w-text_w-60,(w-text_w)/2))'`,
            `y=h*0.80`,
            `enable='between(t,${s.start.toFixed(2)},${s.end.toFixed(2)})'`,
        ].join(':'),
    );

    const filterChain = [hookFilter, ...segFilters].join(',');

    await runFfmpeg(
        [
            '-i', videoInRel,
            '-vf', filterChain,
            '-c:v', 'libx264',
            '-preset', 'medium',
            '-crf', VIDEO_CRF,
            '-r', String(VIDEO_FPS),
            '-pix_fmt', 'yuv420p',
            '-an',
            videoOutRel,
        ],
        cwd,
    );
}

async function overlayWatermark(
    videoIn: string,
    markPath: string,
    videoOut: string,
    corner: 'TR' | 'TL' | 'BR' | 'BL',
    opacity: number,
    margin: number,
): Promise<void> {
    const pos = {
        TR: `W-w-${margin}:${margin}`,
        TL: `${margin}:${margin}`,
        BR: `W-w-${margin}:H-h-${margin}`,
        BL: `${margin}:H-h-${margin}`,
    }[corner];
    // colorkey drops the cream background of the brand mark (image-01 doesn't generate
    // alpha PNGs). Without this, colorchannelmixer would just dim the entire cream
    // rectangle instead of leaving only the dark glyph visible.
    await runFfmpeg([
        '-i', videoIn,
        '-i', markPath,
        '-filter_complex',
        `[1:v]format=rgba,colorkey=0xf7f3ec:0.18:0.06,colorchannelmixer=aa=${opacity},scale=140:-1[mark];[0:v][mark]overlay=${pos}:format=auto[v]`,
        '-map', '[v]',
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
        '-r', '30', '-pix_fmt', 'yuv420p', '-an',
        videoOut,
    ]);
}

async function mixAudio(
    videoIn: string,
    voicePath: string,
    musicPath: string | null,
    outPath: string,
    totalDuration: number,
): Promise<void> {
    const voiceFade = `[1:a]loudnorm=I=-14:TP=-1:LRA=11,afade=t=in:st=0:d=0.4,afade=t=out:st=${(totalDuration - 0.6).toFixed(2)}:d=0.6[voice]`;
    if (musicPath && existsSync(musicPath)) {
        const musicShape = `[2:a]volume=${MUSIC_VOL},afade=t=in:st=0:d=0.3,afade=t=out:st=${(totalDuration - 1.5).toFixed(2)}:d=1.5[bg]`;
        const mix = '[voice][bg]amix=inputs=2:duration=longest:dropout_transition=2:normalize=0[a]';
        await runFfmpeg([
            '-i', videoIn,
            '-i', voicePath,
            '-i', musicPath,
            '-filter_complex', [voiceFade, musicShape, mix].join(';'),
            '-map', '0:v',
            '-map', '[a]',
            '-t', String(totalDuration),
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-ar', '44100',
            '-b:a', '256k',
            '-movflags', '+faststart',
            outPath,
        ]);
    } else {
        await runFfmpeg([
            '-i', videoIn,
            '-i', voicePath,
            '-filter_complex', voiceFade + ';[voice]anull[a]',
            '-map', '0:v',
            '-map', '[a]',
            '-t', String(totalDuration),
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-ar', '44100',
            '-b:a', '256k',
            '-movflags', '+faststart',
            outPath,
        ]);
    }
}

// ---------- orchestration ----------

export async function assembleVideo(opts: AssembleOptions): Promise<{ durationS: number }> {
    if (opts.photos.length === 0) throw new Error('assembleVideo: photos[] is empty');

    const { workDir } = opts;

    // 1) Voice probe — needed for both clip duration and caption timing.
    const voiceDuration = await ffprobeDuration(opts.voicePath);

    // 2) Per-clip Ken-Burns timing — distribute voice + small tail across the
    //    photo sequence, accounting for crossfade overlap. Mirrors the probe.
    const sequence = opts.photos;
    const totalCrossfadeOverlap = Math.max(0, sequence.length - 1) * CROSSFADE_S;
    const targetTotal = voiceDuration + 0.5;
    const perClip = (targetTotal + totalCrossfadeOverlap) / sequence.length;

    const kbPaths: string[] = [];
    for (let i = 0; i < sequence.length; i++) {
        const out = join(workDir, `kb_${String(i).padStart(2, '0')}.mp4`);
        // Match the probe: first clip stable zoom-in, last clip zoom-out, rotate the rest.
        const variant = i === 0 ? 0 : i === sequence.length - 1 ? 1 : ((i + 1) % 4);
        await kenBurnsClip(sequence[i]!, out, perClip, variant);
        kbPaths.push(out);
    }

    // 3) Crossfaded concat.
    const concatPath = join(workDir, 'concat.mp4');
    await concatXfade(kbPaths, concatPath);
    const concatDuration = await ffprobeDuration(concatPath);

    // 4) Caption plan — shift to match TTS lead silence so subs land on speech.
    const leadSilence = await detectLeadSilence(opts.voicePath, CAPTION_LEAD_DELAY);
    const rawSegments = splitForCaptions(opts.narration, voiceDuration - leadSilence);
    const segments = rawSegments.map((s) => ({
        text: s.text,
        start: s.start + leadSilence,
        end: Math.min(s.end + leadSilence, concatDuration - 0.05),
    }));
    const plan = await writeCaptionFiles(workDir, opts.hookText, segments);

    // 5) Burn captions.
    const subbedPath = join(workDir, 'subbed.mp4');
    await burnSubs(concatPath, plan, subbedPath, workDir);

    // 6) Optional watermark overlay.
    let videoForMix = subbedPath;
    if (opts.watermarkPath) {
        const corner = opts.watermarkCorner ?? 'TR';
        const opacity = opts.watermarkOpacity ?? 0.7;
        const margin = opts.watermarkMarginPx ?? 40;
        const wmPath = join(workDir, 'wm.mp4');
        await overlayWatermark(subbedPath, opts.watermarkPath, wmPath, corner, opacity, margin);
        videoForMix = wmPath;
    }

    // 7) Final voice + music mix.
    await mixAudio(videoForMix, opts.voicePath, opts.musicPath, opts.outputPath, concatDuration);

    return { durationS: concatDuration };
}
