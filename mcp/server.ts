#!/usr/bin/env bun
/*
 * Lensbnb MCP server.
 *
 * Exposes ONE tool — `generate_reel` — that turns a structured brief into a
 * 30-second 9:16 reel via the same MiniMax + ffmpeg pipeline that drives the
 * web example. Plus a handful of read-only example briefs as resources, and
 * one parameterised prompt to help a calling LLM compose a brief.
 *
 *   bun run mcp:server     (stdio transport — what MCP clients invoke)
 *
 * See README "Use as MCP server" for Claude Desktop config.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    GetPromptRequestSchema,
    ListPromptsRequestSchema,
    ListResourcesRequestSchema,
    ListToolsRequestSchema,
    ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '../pipeline/config.ts';
import { createServiceClient } from '../pipeline/supabase.ts';
import { runPipeline } from '../pipeline/run.ts';
import { REPO_ROOT } from '../pipeline/paths.ts';

// --------------------------------------------------------------------
// Tool: generate_reel
// --------------------------------------------------------------------

const GENERATE_REEL_TOOL = {
    name: 'generate_reel',
    description:
        'Generate a 30-second 9:16 MP4 reel from a structured brief. Orchestrates MiniMax M2 (script + voice picker + photo selector) + image-01 (3 mood cards) + speech-2.8-hd (narration) + music-2.6 (instrumental) + ffmpeg (Ken-Burns + captions + watermark). Synchronous; takes 3-5 minutes per call. Returns the public MP4 URL plus a generation_log surfacing every agentic decision the pipeline made.',
    inputSchema: {
        type: 'object',
        required: ['brief'],
        properties: {
            brief: {
                type: 'object',
                required: ['name', 'description', 'photo_urls'],
                properties: {
                    name: { type: 'string', description: 'Title for the reel.' },
                    description: {
                        type: 'string',
                        description:
                            'Markdown blob. The LLM is instructed to use ONLY facts present here. Use ### Section headings for clarity (e.g., "### About", "### The neighborhood", "### Amenities").',
                    },
                    photo_urls: {
                        type: 'array',
                        items: { type: 'string' },
                        minItems: 1,
                        description:
                            'Publicly fetchable image URLs. The pipeline downloads each, computes a perceptual signature, and the LLM picks the 5 most diverse + useful for the Ken-Burns sequence. Provide 8-15 URLs for best results.',
                    },
                    external_url: { type: 'string', description: 'Optional back-link to the source.' },
                    city: { type: 'string', description: 'Soft hint for narrative grounding.' },
                    neighborhood: { type: 'string', description: 'Soft hint for narrative grounding.' },
                },
            },
            taste: {
                type: 'object',
                properties: {
                    target_seconds: { type: 'number', description: 'Soft hint; v0.1 always targets ~30s.' },
                },
            },
            options: {
                type: 'object',
                properties: {
                    include_watermark: {
                        type: 'boolean',
                        description: 'Default true. Reads brand/branding.json for corner/opacity.',
                    },
                },
            },
        },
    },
} as const;

interface ReelBrief {
    name: string;
    description: string;
    photo_urls: string[];
    external_url?: string;
    city?: string;
    neighborhood?: string;
}

interface GenerateReelArgs {
    brief: ReelBrief;
    taste?: { target_seconds?: number };
    options?: { include_watermark?: boolean };
}

interface ReelMeta {
    voice_id?: string;
    voice_rationale?: string;
    music_mood?: string;
    photo_selection?: { chosen_positions?: number[]; rationale?: string; method?: string; candidates_total?: number };
    retry_count?: number;
    validation_failures?: string[][];
}

async function handleGenerateReel(args: GenerateReelArgs): Promise<unknown> {
    if (!args?.brief) throw new Error('ValidationError: missing `brief`');
    const { name, description, photo_urls } = args.brief;
    if (!name || typeof name !== 'string') throw new Error('ValidationError: `brief.name` (string) required');
    if (!description || typeof description !== 'string') throw new Error('ValidationError: `brief.description` (string) required');
    if (!Array.isArray(photo_urls) || photo_urls.length === 0) {
        throw new Error('ValidationError: `brief.photo_urls` (non-empty array of URLs) required');
    }

    const cfg = await loadConfig();
    const sb = createServiceClient(cfg);

    // Insert synthetic listing tagged source='mcp' so reset:mcp can find it.
    const sourceId = `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { data: listing, error: lErr } = await sb
        .from('listings')
        .insert({
            source: 'mcp',
            source_id: sourceId,
            name,
            description,
            photo_urls,
            external_url: args.brief.external_url ?? null,
            city: args.brief.city ?? null,
            neighborhood: args.brief.neighborhood ?? null,
        })
        .select('id')
        .single();
    if (lErr || !listing) throw new Error(`failed to insert synthetic listing: ${lErr?.message}`);

    // Insert a reel row, then run the pipeline synchronously.
    const { data: reel, error: rErr } = await sb
        .from('reels')
        .insert({ listing_id: listing.id, status: 'pending' })
        .select('id')
        .single();
    if (rErr || !reel) throw new Error(`failed to insert reel: ${rErr?.message}`);

    try {
        await runPipeline(reel.id);
    } catch (err) {
        throw new Error(`pipeline failed: ${(err as Error).message}`);
    }

    // Read back the final reel state.
    const { data: final, error: fErr } = await sb
        .from('reels')
        .select('mp4_url, duration_s, script_json, error_msg')
        .eq('id', reel.id)
        .single();
    if (fErr || !final) throw new Error(`failed to read reel: ${fErr?.message}`);
    if (!final.mp4_url) {
        throw new Error(`pipeline finished without mp4_url. ${final.error_msg ?? ''}`);
    }

    const script = final.script_json as Record<string, unknown> & { meta?: ReelMeta };
    const meta = script?.meta ?? {};

    const rawHashtags = script?.['hashtags'];
    const hashtags = Array.isArray(rawHashtags) ? rawHashtags.filter((h): h is string => typeof h === 'string') : [];

    return {
        mp4_url: final.mp4_url as string,
        duration_s: Number(final.duration_s ?? 0),
        caption: (script?.['caption'] as string | undefined) ?? '',
        hashtags,
        generation_log: {
            voice_id: meta.voice_id,
            voice_rationale: meta.voice_rationale,
            music_mood: meta.music_mood,
            photo_selection: meta.photo_selection,
            retry_count: meta.retry_count,
            validation_failures: meta.validation_failures,
        },
    };
}

// --------------------------------------------------------------------
// Resources: example briefs that demonstrate "any input → reel"
// --------------------------------------------------------------------

const EXAMPLES_DIR = join(REPO_ROOT, 'mcp', 'examples');

const RESOURCES = [
    {
        uri: 'lensbnb://example/airbnb-marais',
        name: 'Airbnb listing — Marais loft',
        description:
            'A short-stay rental brief from our Inside Airbnb dataset: parquet floors, river view, three minutes from Place des Vosges. The native demonstration use case.',
        mimeType: 'application/json',
        file: 'airbnb-marais.json',
    },
    {
        uri: 'lensbnb://example/news-bees-pollinate',
        name: 'News explainer — pollinator decline',
        description:
            'A 30-second explainer reel built from a news paragraph about why bees matter for the global food supply. Photos sourced from Wikimedia Commons. Same MCP tool, completely different domain from real estate.',
        mimeType: 'application/json',
        file: 'news-bees-pollinate.json',
    },
    {
        uri: 'lensbnb://example/recipe-tarte-tatin',
        name: 'Recipe — Tarte Tatin',
        description:
            'A cooking-recipe brief. Photos are real Wikimedia shots of the finished dessert plus apples and caramel; pipeline narrates from the recipe description while the photo selector picks visually-distinct shots. Demonstrates the tool on visual-document content.',
        mimeType: 'application/json',
        file: 'recipe-tarte-tatin.json',
    },
    {
        uri: 'lensbnb://example/oss-readme',
        name: 'OSS project intro (template)',
        description:
            'A template brief for "project intro reel" use cases. The photo_urls field points to placehold.co colour blocks so the brief is callable end-to-end; in real use, swap them for actual screenshots, logos, or architecture diagrams from your project.',
        mimeType: 'application/json',
        file: 'oss-readme.json',
    },
] as const;

async function readExample(file: string): Promise<string> {
    return await readFile(join(EXAMPLES_DIR, file), 'utf8');
}

// --------------------------------------------------------------------
// Prompts: parameterised templates the calling LLM can use
// --------------------------------------------------------------------

const PROMPTS = [
    {
        name: 'compose_brief',
        description:
            'Two-message template that walks an LLM through composing a valid `generate_reel` brief from minimal user input. Useful for clients (Claude Desktop, etc.) that want a guided flow.',
        arguments: [
            { name: 'topic', description: 'What the reel should be about.', required: true },
            { name: 'style', description: 'Optional vibe hint (e.g., "warm and personal", "cinematic explainer").', required: false },
        ],
    },
] as const;

function composeBriefMessages(topic: string, style?: string): unknown[] {
    const styleClause = style
        ? `\n\nSTYLE HINT FROM THE USER: "${style}". Honour it in tone and section choices.`
        : '';

    const guidance = `You are helping a user compose a \`brief\` argument for the Lensbnb \`generate_reel\` MCP tool, which will turn that brief into a 30-second 9:16 vertical reel using MiniMax M2 + image-01 + speech-2.8-hd + music-2.6 + ffmpeg.

The brief is the ONLY contract you have with the pipeline. Get it right, and the reel will be coherent. Get it sloppy, and the LLM will hallucinate features the user never claimed.

== BRIEF SHAPE ==

Required fields:

- \`name\` (string, ≤ 60 chars). The short, concrete title. Example: "Marais loft with river view" — not "Lovely place" or "Apartment".

- \`description\` (markdown string, 200-1500 chars). The single source of truth for what's true about the subject. Use \`### Section\` headings so the downstream LLM can navigate it. Common sections that work well across domains:
    \`### About\`              — the one-paragraph essence
    \`### History\`           — provenance, story, origin (recipe origin, project history, place history)
    \`### Details\`           — specifics (ingredients, specs, room count, features)
    \`### Method\` / \`### How it works\`  — process or use
    \`### The neighborhood\` / \`### Where it lives\`  — location for short-stay; surrounding context for anything else
    \`### Why it matters\`    — for explainers (news, OSS, education)
  Don't pad with fluff. Real text only.

- \`photo_urls\` (array of strings, ≥ 1, ideally 8-15). Each must be a publicly-fetchable image URL the server can download. PNG/JPG/WebP. The pipeline downloads ALL of them, computes perceptual signatures, code-clusters near-duplicates, and the LLM picks 5 most diverse + useful for the Ken-Burns sequence. If the user gives you fewer than 6, the AI selection step won't fire — it'll just use what's there. So push for more URLs.

Optional fields:
- \`external_url\` (string): a back-link the demo UI will surface ("View on Airbnb", "Read on Wikipedia", "View on GitHub", etc.).
- \`city\`, \`neighborhood\` (strings): soft narrative hints. Use them when the location is a meaningful part of the story, leave them blank otherwise.

== HARD RULES (NON-NEGOTIABLE) ==

1. **Never invent facts.** If the user did not say the place has a balcony, your description must not mention a balcony. If the user did not specify caramel was added at minute 12, do not add minute 12. The downstream LLM is instructed to use ONLY facts present in the description; you must give it accurate facts.
2. **Never fabricate photo URLs.** If the user does not provide URLs, ask for them. Do not invent muscache.com URLs, Wikipedia URLs, or stock-photo URLs that you imagine should exist. Wrong URLs cause 404s and break the reel.
3. **Description should be domain-appropriate.** A recipe brief should read like a recipe (ingredients, method, history); an OSS brief should read like a project README (what, why, stack); a real-estate brief should read like a listing (rooms, neighborhood, amenities). Use the section names that fit.
4. **Don't pad to hit a word count.** A tight 250-word description beats a 1200-word one with filler.
5. **Keep \`name\` concrete and specific.** "Tarte Tatin — caramelised apple tart" beats "A French dessert".

== EXAMPLES ==

GOOD brief (real-estate, scaffolded from minimal user input "Marais loft, view of the river, three minutes from Place des Vosges"):
\`\`\`json
{
  "name": "Marais loft with river view",
  "description": "### About\\nA top-floor loft in Le Marais with original beams, parquet floors, and a view onto the Seine. One bedroom on a mezzanine, sleeps two.\\n\\n### The neighborhood\\nHôtel-de-Ville, Paris. Three minutes' walk to Place des Vosges, ten to Notre-Dame. Rue Saint-Paul (cheese, bread, fresh produce) is one block over.",
  "photo_urls": ["<URL provided by user>", "<URL>", "..."],
  "external_url": "https://www.airbnb.com/rooms/<id>",
  "city": "Paris",
  "neighborhood": "Hôtel-de-Ville"
}
\`\`\`

GOOD brief (recipe, totally different domain, same shape):
\`\`\`json
{
  "name": "Tarte Tatin — caramelised apple tart",
  "description": "### About\\nA French upside-down tart with caramelised apples and buttery pastry...\\n\\n### History\\nInvented by accident in the 1880s by the Tatin sisters in Lamotte-Beuvron...\\n\\n### Ingredients\\n- 6 firm apples\\n- 100 g butter\\n...\\n\\n### Method\\nMelt butter and sugar...",
  "photo_urls": ["<verified Wikimedia URL>", "..."],
  "external_url": "https://en.wikipedia.org/wiki/Tarte_Tatin"
}
\`\`\`

BAD brief (do NOT do this):
\`\`\`json
{
  "name": "Lovely apartment",
  "description": "A stunning 5-star romantic getaway in the heart of magical Paris! Wake up to the smell of fresh croissants and the sound of accordions playing on cobblestone streets. Featuring a gorgeous balcony, a chef's kitchen, and views you'll never forget.",
  "photo_urls": ["https://example.com/photo1.jpg"]
}
\`\`\`
Why bad: pads with clichés ("magical Paris", "5-star", "you'll never forget"); invents features (accordions, balcony, chef's kitchen) the user never claimed; only one photo URL; placeholder example.com URLs.

== YOUR TURN ==

The user wants a brief about: **${topic}**${styleClause}

Now:
1. If the user has already given you the facts AND the photo URLs you need, draft the brief JSON directly.
2. If you are missing facts, ask one short focused question to fill the gap.
3. If you are missing photo URLs, ask the user to paste them. Suggest where to look (Wikimedia Commons for general topics, Inside Airbnb for real-estate examples, Unsplash for generic stock).

When you produce the final JSON, emit it as a single fenced JSON code block with no commentary after — that's what the user will pass to \`generate_reel\`.`;

    return [
        {
            role: 'user',
            content: { type: 'text', text: guidance },
        },
    ];
}

// --------------------------------------------------------------------
// Wire it all up
// --------------------------------------------------------------------

const server = new Server(
    { name: 'lensbnb', version: '0.1.0' },
    { capabilities: { tools: {}, resources: {}, prompts: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [GENERATE_REEL_TOOL],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
    if (req.params.name !== 'generate_reel') {
        throw new Error(`unknown tool: ${req.params.name}`);
    }
    try {
        const result = await handleGenerateReel(req.params.arguments as GenerateReelArgs);
        return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
    } catch (err) {
        return {
            isError: true,
            content: [{ type: 'text', text: `${(err as Error).message}` }],
        };
    }
});

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: RESOURCES.map((r) => ({
        uri: r.uri,
        name: r.name,
        description: r.description,
        mimeType: r.mimeType,
    })),
}));

server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const r = RESOURCES.find((x) => x.uri === req.params.uri);
    if (!r) throw new Error(`unknown resource: ${req.params.uri}`);
    const text = await readExample(r.file);
    return {
        contents: [{ uri: r.uri, mimeType: r.mimeType, text }],
    };
});

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: PROMPTS.map((p) => ({ name: p.name, description: p.description, arguments: p.arguments })),
}));

server.setRequestHandler(GetPromptRequestSchema, async (req) => {
    if (req.params.name !== 'compose_brief') {
        throw new Error(`unknown prompt: ${req.params.name}`);
    }
    const a = (req.params.arguments ?? {}) as { topic?: string; style?: string };
    if (!a.topic) throw new Error('missing required argument: topic');
    return {
        description: 'Walks the calling LLM through composing a valid generate_reel brief.',
        messages: composeBriefMessages(a.topic, a.style),
    };
});

// --------------------------------------------------------------------
// Stdio main
// --------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
// stay alive — connect() resolves immediately with stdio
console.error('lensbnb MCP server ready on stdio');
