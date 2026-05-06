#!/usr/bin/env bun
// One-shot: generate Lensbnb logo + mark via image-01.
// Run once; commit the outputs to git. NOT called from production.

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { loadConfig } from '../pipeline/config.ts';
import { Minimax } from '../pipeline/minimax.ts';
import { logoPath, watermarkPath } from '../pipeline/paths.ts';

const LOGO_PROMPT = `Minimal modern logo for a real-estate-Reels mock company called "Lensbnb". A stylized camera-aperture symbol (geometric, 6-blade iris, clean vector style) next to the wordmark "Lensbnb" set in a contemporary geometric sans-serif. Monochrome charcoal on a clean off-white background. High contrast, balanced spacing, suitable as a brand mark. Logo centered with plenty of negative space — wide composition since the wordmark is text-bearing.`;

const MARK_PROMPT = `A single stylized camera-aperture symbol, 6 geometric blades forming an iris, monochrome charcoal silhouette on a clean off-white background. Bold vector style, clean lines, no text, no wordmark. Symbol centered in a square composition, suitable for use as a small watermark.`;

async function main(): Promise<void> {
    const cfg = await loadConfig();
    const mini = new Minimax(cfg);
    await mkdir(dirname(logoPath()), { recursive: true });

    console.log('▸ generating logo (with wordmark, 16:9)…');
    const logoUrl = await mini.image(LOGO_PROMPT, '16:9');
    const logoBuf = Buffer.from(await (await fetch(logoUrl)).arrayBuffer());
    await writeFile(logoPath(), logoBuf);
    console.log(`  ✓ ${logoPath()} (${(logoBuf.length / 1024).toFixed(0)} KB)`);

    console.log('▸ generating mark (symbol only, 1:1)…');
    const markUrl = await mini.image(MARK_PROMPT, '1:1');
    const markBuf = Buffer.from(await (await fetch(markUrl)).arrayBuffer());
    await writeFile(watermarkPath(), markBuf);
    console.log(`  ✓ ${watermarkPath()} (${(markBuf.length / 1024).toFixed(0)} KB)`);
}

await main();
