'use client';
import { useState } from 'react';

interface PhotoSelection {
  candidates_total?: number;
  candidates_uncapped?: number;
  chosen_positions?: number[];
  method?: string;
  rationale?: string;
}

interface ReelMeta {
  retry_count?: number;
  validation_failures?: string[][];
  voice_id?: string;
  voice_rationale?: string;
  music_mood?: string;
  photo_selection?: PhotoSelection | null;
}

interface ScriptJson {
  meta?: ReelMeta;
}

/**
 * "How this reel was made" — a small disclosure surfacing the LLM-driven
 * decisions captured by the pipeline. Written for the hackathon's Innovation
 * criterion: makes the agentic behavior visible to the judge.
 */
export function HowThisWasMade({ scriptJson }: { scriptJson: ScriptJson | null | undefined }) {
  const [open, setOpen] = useState(false);
  const meta = scriptJson?.meta;
  if (!meta) return null;

  const { voice_id, voice_rationale, music_mood, retry_count, photo_selection } = meta;
  const retried = (retry_count ?? 0) > 0;

  return (
    <div className="text-xs">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-[var(--color-ink-soft)] hover:text-[var(--color-cognac)] transition-colors flex items-center gap-1"
      >
        <span aria-hidden>{open ? '▾' : '▸'}</span> How this reel was made
      </button>
      {open && (
        <dl className="mt-2 space-y-2 pl-3 border-l-2 border-[var(--color-line-soft)]">
          {voice_id && (
            <Row
              label="Voice"
              value={
                <>
                  <span className="font-mono">{voice_id}</span>
                  {voice_rationale && (
                    <span className="block text-[var(--color-fade)] italic mt-0.5">
                      &ldquo;{voice_rationale}&rdquo;
                    </span>
                  )}
                </>
              }
            />
          )}
          {music_mood && <Row label="Music mood" value={music_mood} />}
          {photo_selection?.chosen_positions && (
            <Row
              label="Photos"
              value={
                <>
                  Picked {photo_selection.chosen_positions.length} of{' '}
                  {photo_selection.candidates_uncapped ?? photo_selection.candidates_total ?? '?'}{' '}
                  (positions {photo_selection.chosen_positions.join(', ')})
                  {photo_selection.rationale && (
                    <span className="block text-[var(--color-fade)] italic mt-0.5">
                      &ldquo;{photo_selection.rationale}&rdquo;
                    </span>
                  )}
                </>
              }
            />
          )}
          <Row
            label="Retries"
            value={
              <>
                {retry_count ?? 0}
                {retried && (
                  <span className="text-[var(--color-fade)]">
                    {' '}
                    (script auto-corrected)
                  </span>
                )}
              </>
            }
          />
        </dl>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="uppercase tracking-[0.18em] text-[var(--color-fade)] min-w-20 text-[10px] pt-0.5">
        {label}
      </dt>
      <dd className="text-[var(--color-ink-soft)] flex-1">{value}</dd>
    </div>
  );
}
