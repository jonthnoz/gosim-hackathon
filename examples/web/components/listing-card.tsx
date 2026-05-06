'use client';
import { useState } from 'react';
import { VideoProgress } from './video-progress';
import { HowThisWasMade } from './how-this-was-made';

interface Listing {
  id: string;
  name: string;
  neighborhood: string | null;
  photo_urls: string[];
  external_url: string | null;
}
interface LatestReel {
  id: string;
  status: 'pending' | 'running' | 'ready' | 'error';
  mp4_url: string | null;
  error_msg: string | null;
  script_json: Record<string, unknown> | null;
}

export function ListingCard({ listing, initialReel }: { listing: Listing; initialReel: LatestReel | null }) {
  const [reel, setReel] = useState<LatestReel | null>(initialReel);
  const [busy, setBusy] = useState(false);
  const [posted, setPosted] = useState(false);

  const onGenerate = async () => {
    setBusy(true);
    setPosted(false);
    const r = await fetch('/api/generate/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ listingId: listing.id }),
    });
    const d = await r.json() as { reelId: string };
    setReel({ id: d.reelId, status: 'pending', mp4_url: null, error_msg: null, script_json: null });
    setBusy(false);
  };

  const onPost = async () => {
    if (!reel) return;
    await fetch('/api/publish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reelId: reel.id }),
    });
    setPosted(true);
    setTimeout(() => setPosted(false), 3500);
  };

  const isActive = reel && (reel.status === 'pending' || reel.status === 'running');
  const isReady = reel?.status === 'ready' && reel.mp4_url;
  const photo = listing.photo_urls[0];

  return (
    <article className="card-listing">
      {/* Photo or video — vertical 4:5; video letterboxes (cream side bars) since reel is 9:16 */}
      <div className="relative aspect-[4/5] bg-[var(--color-mute)] overflow-hidden">
        {isReady && reel?.mp4_url ? (
          <video
            controls
            src={reel.mp4_url}
            className="absolute inset-0 w-full h-full object-contain bg-[var(--color-paper)]"
          />
        ) : photo ? (
          <img
            src={photo}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        ) : null}

        {isActive && reel && (
          <div className="absolute inset-x-3 bottom-3 flex justify-end">
            <VideoProgress
              reelId={reel.id}
              onUpdate={(s) => setReel({
                id: reel.id,
                status: s.status,
                mp4_url: s.mp4_url,
                error_msg: s.error_msg,
                script_json: s.script_json ?? reel.script_json,
              })}
            />
          </div>
        )}

        {posted && (
          <div className="absolute inset-x-4 top-4 px-3 py-1.5 rounded-full text-xs font-medium text-white bg-[var(--color-patina)]/95 backdrop-blur shadow-md text-center">
            Posted to @lensbnb_demo
          </div>
        )}
      </div>

      {/* Meta + actions */}
      <div className="p-5 flex flex-col gap-4">
        <div>
          <h3
            className="font-display text-xl leading-snug text-[var(--color-ink)]"
            style={{ fontVariationSettings: '"opsz" 36' }}
          >
            {listing.name}
          </h3>
          {listing.neighborhood && (
            <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-[var(--color-fade)]">
              {listing.neighborhood}
            </p>
          )}
          {listing.external_url && (
            <a
              href={listing.external_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-cognac)] transition-colors"
            >
              View on Airbnb <span aria-hidden>↗</span>
            </a>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {!reel && (
            <button onClick={onGenerate} disabled={busy} className="btn-primary">
              Generate reel
            </button>
          )}
          {isActive && (
            <button disabled className="btn-ghost opacity-60 cursor-not-allowed">
              Generating…
            </button>
          )}
          {isReady && (
            <>
              <button onClick={onPost} className="btn-publish">
                Post
              </button>
              <button onClick={onGenerate} className="btn-quiet">
                Regenerate
              </button>
            </>
          )}
          {reel?.status === 'error' && (
            <>
              <button onClick={onGenerate} className="btn-retry">
                Retry
              </button>
              <span
                className="self-center text-xs text-[var(--color-coral)] truncate"
                title={reel.error_msg ?? ''}
              >
                Generation failed
              </span>
            </>
          )}
        </div>

        {isReady && reel?.script_json && (
          <HowThisWasMade scriptJson={reel.script_json} />
        )}
      </div>
    </article>
  );
}
