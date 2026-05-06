'use client';
import { useEffect, useState } from 'react';

interface Branding {
  watermark: { enabled: boolean; corner: 'TR' | 'TL' | 'BR' | 'BL'; opacity: number; margin_px: number };
}

const CORNERS: { value: 'TR' | 'TL' | 'BR' | 'BL'; label: string; align: string }[] = [
  { value: 'TL', label: 'Top left', align: 'items-start justify-start' },
  { value: 'TR', label: 'Top right', align: 'items-start justify-end' },
  { value: 'BL', label: 'Bottom left', align: 'items-end justify-start' },
  { value: 'BR', label: 'Bottom right', align: 'items-end justify-end' },
];

export function BrandingEditor() {
  const [b, setB] = useState<Branding | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/branding').then((r) => r.json()).then(setB);
  }, []);

  if (!b) return <div className="text-sm text-[var(--color-fade)]">Loading…</div>;

  const set = (patch: Partial<Branding['watermark']>) =>
    setB({ ...b, watermark: { ...b.watermark, ...patch } });

  const save = async () => {
    setSaving(true);
    await fetch('/api/branding', {
      method: 'PUT',
      body: JSON.stringify(b),
      headers: { 'content-type': 'application/json' },
    });
    setSaving(false);
    setSavedAt(Date.now());
    setTimeout(() => setSavedAt(null), 2500);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[auto,1fr] gap-8 items-start">
      {/* Live preview — 9:16 frame mimicking the reel canvas */}
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-fade)] mb-2">Preview</p>
        <div className="relative w-44 aspect-[9/16] rounded-md overflow-hidden bg-gradient-to-br from-[var(--color-ink)] to-[var(--color-ink-soft)]">
          {b.watermark.enabled && (
            <div
              className={`absolute inset-0 p-3 flex ${CORNERS.find((c) => c.value === b.watermark.corner)?.align}`}
              style={{ padding: `${Math.min(b.watermark.margin_px / 2, 24)}px` }}
            >
              <img
                src="/lensbnb-mark.png"
                alt="watermark"
                className="w-8 h-8 object-contain"
                style={{ opacity: b.watermark.opacity }}
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="space-y-5 text-sm">
        <label className="flex items-center gap-3 select-none cursor-pointer">
          <input
            type="checkbox"
            checked={b.watermark.enabled}
            onChange={(e) => set({ enabled: e.target.checked })}
            className="w-4 h-4 accent-[var(--color-cognac)]"
          />
          <span className="text-[var(--color-ink)]">Enable watermark</span>
        </label>

        <div className={b.watermark.enabled ? '' : 'opacity-50 pointer-events-none'}>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-fade)] mb-2">Corner</p>
          <div className="grid grid-cols-2 gap-1.5 max-w-xs">
            {CORNERS.map((c) => {
              const active = b.watermark.corner === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => set({ corner: c.value })}
                  className={
                    'text-left text-xs px-3 py-2 rounded-md border transition-colors ' +
                    (active
                      ? 'bg-[var(--color-cognac)] text-[var(--color-paper)] border-[var(--color-cognac)]'
                      : 'bg-[var(--color-card)] text-[var(--color-ink-soft)] border-[var(--color-line)] hover:bg-[var(--color-mute)]')
                  }
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className={b.watermark.enabled ? '' : 'opacity-50 pointer-events-none'}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs uppercase tracking-[0.18em] text-[var(--color-fade)]">Opacity</span>
            <span className="font-mono text-xs text-[var(--color-ink-soft)]">{b.watermark.opacity.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={b.watermark.opacity}
            onChange={(e) => set({ opacity: Number(e.target.value) })}
            className="w-full accent-[var(--color-cognac)]"
          />
        </div>

        <div className={b.watermark.enabled ? '' : 'opacity-50 pointer-events-none'}>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-fade)] mb-1.5">Margin (px)</p>
          <input
            type="number"
            min="0"
            max="200"
            value={b.watermark.margin_px}
            onChange={(e) => set({ margin_px: Number(e.target.value) })}
            className="input-paper w-24"
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button onClick={save} disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : 'Save'}
          </button>
          {savedAt && (
            <span className="text-xs text-[var(--color-patina)]">Saved</span>
          )}
        </div>
      </div>
    </div>
  );
}
