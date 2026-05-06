'use client';
import { useEffect, useState } from 'react';

interface Status {
  status: 'pending' | 'running' | 'ready' | 'error';
  stage: string | null;
  mp4_url: string | null;
  error_msg: string | null;
  script_json: Record<string, unknown> | null;
}

const STAGE_LABEL: Record<string, string> = {
  script: 'Writing the script',
  images: 'Generating cards',
  voice: 'Recording narration',
  music: 'Composing music',
  assembly: 'Stitching the reel',
};

export function VideoProgress({
  reelId,
  onUpdate,
}: {
  reelId: string;
  onUpdate: (s: Status) => void;
}) {
  const [s, setS] = useState<Status | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const r = await fetch(`/api/generate/status?reelId=${reelId}`);
      if (!r.ok) return;
      const d = (await r.json()) as Status;
      if (cancelled) return;
      setS(d);
      onUpdate(d);
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => { cancelled = true; clearInterval(id); };
  }, [reelId, onUpdate]);

  if (!s || s.status === 'pending') {
    return <span className="pill-stage shadow-sm bg-[var(--color-card)]">Starting</span>;
  }
  if (s.status === 'error') {
    return (
      <span className="pill-stage shadow-sm bg-[var(--color-card)]" title={s.error_msg ?? ''}>
        <span className="text-[var(--color-coral)]">Failed</span>
      </span>
    );
  }
  if (s.status === 'running') {
    return (
      <span className="pill-stage shadow-sm bg-[var(--color-card)]">
        {STAGE_LABEL[s.stage ?? ''] ?? 'Working'}
      </span>
    );
  }
  return null;
}
