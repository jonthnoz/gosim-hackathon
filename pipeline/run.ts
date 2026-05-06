import { mkdtempSync } from 'node:fs';
import { writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { loadConfig } from './config.ts';
import { Minimax } from './minimax.ts';
import { createServiceClient } from './supabase.ts';
import { uploadBuffer } from './storage.ts';
import { loadPrompt } from './prompts.ts';
import { brandingPath, watermarkPath } from './paths.ts';
import { generateScript } from './generate-script.ts';
import { generateCards } from './generate-images.ts';
import { generateVoice, DEFAULT_VOICE_ID } from './generate-voice.ts';
import { generateMusic } from './generate-music.ts';
import { assembleVideo } from './assemble-video.ts';
import { selectVoice } from './select-voice.ts';
import { selectPhotos } from './select-photos.ts';
import { fetchAndSignPhotos } from './photo-signatures.ts';
import type { Listing, ReelStage } from './types.ts';

interface BrandingConfig {
    watermark: { enabled: boolean; corner: 'TR' | 'TL' | 'BR' | 'BL'; opacity: number; margin_px: number };
}

export async function runPipeline(reelId: string): Promise<void> {
    const cfg = await loadConfig();
    const sb = createServiceClient(cfg);
    const minimax = new Minimax(cfg);

    const update = async (patch: Record<string, unknown>): Promise<void> => {
        const { error } = await sb.from('reels').update(patch).eq('id', reelId);
        if (error) throw new Error(`reels update failed: ${error.message}`);
    };

    try {
        await update({ status: 'running' });

        const { data: reel, error: rErr } = await sb.from('reels').select('listing_id').eq('id', reelId).single();
        if (rErr || !reel) throw new Error(`reel ${reelId} not found`);
        const { data: listing, error: lErr } = await sb.from('listings').select('*').eq('id', reel.listing_id).single();
        if (lErr || !listing) throw new Error(`listing ${reel.listing_id} not found`);

        const setStage = (s: ReelStage) => update({ stage: s });

        // 1. Script — schema-validated with up to 2 retries on validation failure.
        // Plus parallel: LLM-driven voice persona selection (independent from script gen).
        await setStage('script');
        const promptTemplate = await loadPrompt('script');
        const [scriptResult, voicePersona] = await Promise.all([
            generateScript(listing as Listing, promptTemplate, minimax),
            selectVoice(listing as Listing, minimax).catch(() => ({ voiceId: DEFAULT_VOICE_ID, rationale: 'fallback (selectVoice threw)' })),
        ]);
        const script = scriptResult.script;
        // Music mood is emergent from M2's musicPrompt — extract a short label for the meta log.
        const musicMood = script.musicPrompt.split(/[,.;]/)[0]?.trim().slice(0, 80) ?? '';
        // Photo selection happens later (needs ffmpeg + downloads) — placeholder for now.
        const meta: Record<string, unknown> = {
            retry_count: scriptResult.retryCount,
            validation_failures: scriptResult.validationFailures,
            voice_id: voicePersona.voiceId,
            voice_rationale: voicePersona.rationale,
            music_mood: musicMood,
        };
        // Persist script + meta as a single jsonb blob; UI reads `script_json.meta`.
        await update({
            script_json: { ...script, meta },
            prompt_snapshot: promptTemplate,
        });

        // 2. Images (cards)
        await setStage('images');
        const cards = await generateCards(script, minimax, sb, reelId);

        // 3. Voice — uses the LLM-chosen persona
        await setStage('voice');
        const voiceUrl = await generateVoice(script.narration, voicePersona.voiceId, minimax, sb, reelId);
        await update({ voice_url: voiceUrl });

        // 4. Music
        await setStage('music');
        const musicUrl = await generateMusic(script.musicPrompt, minimax, sb, reelId);
        await update({ music_url: musicUrl });

        // 5. Assembly — agentic photo selection happens here (downloads all candidates,
        //    computes signatures, M2 picks the diverse 5).
        await setStage('assembly');
        const work = mkdtempSync(join(tmpdir(), `lensbnb-${reelId}-`));
        const dl = async (url: string, dest: string): Promise<void> => {
            const r = await fetch(url);
            if (!r.ok) throw new Error(`download ${url}: ${r.status}`);
            await writeFile(dest, Buffer.from(await r.arrayBuffer()));
        };

        const photos = (listing as Listing).photo_urls;
        if (photos.length === 0) throw new Error('listing has no photo_urls');

        // 5a. Download all candidate photos + compute 8x8 grayscale signatures.
        const signed = await fetchAndSignPhotos(photos, work);
        if (signed.length === 0) throw new Error('all candidate photo downloads failed');

        // 5b. M2 picks the diverse 5 from the candidates (with code-side cluster hints).
        const photoSelection = await selectPhotos(signed.map((s) => s.candidate), minimax);

        // 5c. Map chosen positions back to local file paths.
        const positionToLocal = new Map(signed.map((s) => [s.candidate.position, s.localPath]));
        const photoPaths: string[] = [];
        for (const pos of photoSelection.chosenPositions) {
            const p = positionToLocal.get(pos);
            if (p) photoPaths.push(p);
        }
        if (photoPaths.length === 0) throw new Error('photo selection returned no usable paths');

        // 5d. Persist the selection into reels.script_json.meta so the UI can show it.
        meta['photo_selection'] = {
            candidates_total: signed.length,
            candidates_uncapped: photos.length,
            chosen_positions: photoSelection.chosenPositions,
            method: photoSelection.method,
            rationale: photoSelection.rationale,
        };
        await update({ script_json: { ...script, meta } });

        // 5e. Download the cards + voice + music (kept in same workDir).
        const titleP = join(work, 'card-title.jpg'); await dl(cards.titleUrl, titleP);
        const lifestyleP = join(work, 'card-lifestyle.jpg'); await dl(cards.lifestyleUrl, lifestyleP);
        const endP = join(work, 'card-end.jpg'); await dl(cards.endUrl, endP);
        const voiceP = join(work, 'voice.mp3'); await dl(voiceUrl, voiceP);
        const musicP = join(work, 'music.mp3'); await dl(musicUrl, musicP);

        // Branding (resolved via paths.ts — works from any cwd)
        let resolvedWatermark: string | null = null;
        let branding: BrandingConfig = { watermark: { enabled: false, corner: 'TR', opacity: 0.7, margin_px: 40 } };
        if (existsSync(brandingPath())) {
            branding = JSON.parse(await readFile(brandingPath(), 'utf8')) as BrandingConfig;
        }
        if (branding.watermark.enabled && existsSync(watermarkPath())) {
            resolvedWatermark = watermarkPath();
        }

        const sequence = [titleP, ...photoPaths, lifestyleP, endP];
        const finalLocal = join(work, 'final.mp4');
        const { durationS } = await assembleVideo({
            outputPath: finalLocal,
            workDir: work,
            photos: sequence,
            voicePath: voiceP,
            musicPath: musicP,
            hookText: script.hookText,
            narration: script.narration,
            watermarkPath: resolvedWatermark,
            watermarkCorner: branding.watermark.corner,
            watermarkOpacity: branding.watermark.opacity,
            watermarkMarginPx: branding.watermark.margin_px,
        });

        const finalBuf = await readFile(finalLocal);
        const mp4Url = await uploadBuffer(sb, 'reels', `${reelId}.mp4`, finalBuf, 'video/mp4');

        await update({ status: 'ready', stage: null, mp4_url: mp4Url, duration_s: durationS, error_msg: null });
    } catch (err) {
        await update({ status: 'error', error_msg: (err as Error).message });
        throw err;
    }
}

if (import.meta.main) {
    const id = process.argv[2];
    if (!id) {
        console.error('usage: bun run pipeline/run.ts <reelId>');
        process.exit(2);
    }
    await runPipeline(id);
}
