export type ReelStage = 'script' | 'images' | 'voice' | 'music' | 'assembly';
export type ReelStatus = 'pending' | 'running' | 'ready' | 'error';

export interface Listing {
    id: string;
    source: string;
    source_id: string;
    name: string;
    description: string;
    photo_urls: string[];
    external_url: string | null;
    city: string | null;
    neighborhood: string | null;
}

export interface Script {
    title: string;
    hookText: string;
    narration: string;
    titleCardPrompt: string;
    lifestylePrompt: string;
    endCardPrompt: string;
    musicPrompt: string;
    caption: string;
    hashtags: string[];
}

export interface Reel {
    id: string;
    listing_id: string;
    status: ReelStatus;
    stage: ReelStage | null;
    script_json: Script | null;
    voice_url: string | null;
    music_url: string | null;
    mp4_url: string | null;
    duration_s: number | null;
    prompt_snapshot: string | null;
    error_msg: string | null;
}
