import { getAdmin } from '@/lib/db-admin';
import { ListingCard } from '@/components/listing-card';

interface ReelRow {
  id: string;
  listing_id: string;
  status: string;
  mp4_url: string | null;
  error_msg: string | null;
  created_at: string;
  script_json: Record<string, unknown> | null;
}

export default async function Page() {
  const sb = getAdmin();
  const { data: listings } = await sb
    .from('listings')
    .select('id, name, neighborhood, photo_urls, external_url')
    .order('created_at', { ascending: false });

  const reelsByListing = new Map<string, ReelRow>();
  if (listings && listings.length > 0) {
    const { data: reels } = await sb
      .from('reels')
      .select('id, listing_id, status, mp4_url, error_msg, created_at, script_json')
      .order('created_at', { ascending: false });
    for (const r of (reels ?? []) as ReelRow[]) {
      if (!reelsByListing.has(r.listing_id)) reelsByListing.set(r.listing_id, r);
    }
  }

  return (
    <main className="max-w-6xl mx-auto px-8 pt-12 pb-20 w-full">
      <header className="mb-12 max-w-2xl">
        <h1
          className="font-display text-[64px] leading-[1.04] tracking-[-0.02em] text-[var(--color-ink)]"
          style={{ fontVariationSettings: '"opsz" 144' }}
        >
          Listings, <span className="italic font-light text-[var(--color-cognac)]">remixed</span>.
        </h1>
        <p className="mt-5 text-[var(--color-ink-soft)] text-base leading-relaxed">
          Pick a Paris stay below and click <em className="text-[var(--color-ink)] not-italic font-medium">Generate</em>.
          A 30-second 9:16 reel — script, voice, image cards, music, captions — appears in under five minutes.
        </p>
      </header>

      {(listings ?? []).length === 0 ? (
        <div className="card-listing p-10 text-center text-[var(--color-ink-soft)]">
          <p className="font-display text-2xl mb-2">No listings yet.</p>
          <p className="text-sm">
            Run <code className="font-mono text-xs bg-[var(--color-mute)] px-1.5 py-0.5 rounded">bun run adapter:airbnb</code> to populate the grid.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-7">
          {(listings ?? []).map((l) => {
            const latest = reelsByListing.get(l.id);
            return (
              <ListingCard
                key={l.id}
                listing={l as never}
                initialReel={latest ? {
                  id: latest.id,
                  status: latest.status as 'pending' | 'running' | 'ready' | 'error',
                  mp4_url: latest.mp4_url,
                  error_msg: latest.error_msg,
                  script_json: latest.script_json,
                } : null}
              />
            );
          })}
        </div>
      )}
    </main>
  );
}
