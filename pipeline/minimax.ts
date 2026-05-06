import type { Config } from './config.ts';

export class Minimax {
    constructor(private cfg: Pick<Config, 'minimaxApiKey' | 'minimaxBaseUrl'>) {}

    async chat(prompt: string, maxTokens = 5000): Promise<string> {
        const res = await fetch(`${this.cfg.minimaxBaseUrl}/v1/text/chatcompletion_v2`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.cfg.minimaxApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'MiniMax-M2',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: maxTokens,
            }),
        });
        const j = (await res.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
            base_resp?: { status_code?: number; status_msg?: string };
        };
        if (j.base_resp?.status_code !== 0) {
            throw new Error(`M2: ${JSON.stringify(j.base_resp)}`);
        }
        const content = j.choices?.[0]?.message?.content ?? '';
        if (!content) throw new Error('M2 empty content (bump max_tokens)');
        return content;
    }

    async image(prompt: string, aspectRatio: '9:16' | '16:9' | '1:1' | '4:3' | '3:4' = '9:16'): Promise<string> {
        const res = await fetch(`${this.cfg.minimaxBaseUrl}/v1/image_generation`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.cfg.minimaxApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'image-01',
                prompt,
                aspect_ratio: aspectRatio,
                n: 1,
                response_format: 'url',
            }),
        });
        const j = (await res.json()) as {
            data?: { image_urls?: string[] };
            base_resp?: { status_code?: number; status_msg?: string };
        };
        if (j.base_resp?.status_code !== 0) throw new Error(`image-01: ${JSON.stringify(j.base_resp)}`);
        const url = j.data?.image_urls?.[0];
        if (!url) throw new Error('image-01: no URL');
        return url;
    }

    async speech(text: string, voiceId: string): Promise<Buffer> {
        const res = await fetch(`${this.cfg.minimaxBaseUrl}/v1/t2a_v2`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.cfg.minimaxApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'speech-2.8-hd',
                text,
                voice_setting: { voice_id: voiceId, speed: 1.0, vol: 1.0, pitch: 0 },
                audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 },
                output_format: 'hex',
            }),
        });
        const j = (await res.json()) as {
            data?: { audio?: string };
            base_resp?: { status_code?: number; status_msg?: string };
        };
        if (j.base_resp?.status_code !== 0) throw new Error(`speech: ${JSON.stringify(j.base_resp)}`);
        const hex = j.data?.audio;
        if (!hex) throw new Error('speech: no audio');
        return Buffer.from(hex, 'hex');
    }

    async music(prompt: string): Promise<Buffer> {
        const res = await fetch(`${this.cfg.minimaxBaseUrl}/v1/music_generation`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.cfg.minimaxApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'music-2.6',
                lyrics: '[instrumental]',
                prompt,
                audio_setting: { sample_rate: 44100, bitrate: 256000, format: 'mp3' },
            }),
        });
        const j = (await res.json()) as {
            data?: { audio?: string };
            base_resp?: { status_code?: number; status_msg?: string };
        };
        if (j.base_resp?.status_code !== 0) throw new Error(`music: ${JSON.stringify(j.base_resp)}`);
        const hex = j.data?.audio;
        if (!hex) throw new Error('music: no audio');
        return Buffer.from(hex, 'hex');
    }
}
