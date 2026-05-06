'use client';
import { useEffect, useState } from 'react';

export function PromptEditor() {
  const [files, setFiles] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/prompts').then((r) => r.json()).then((d: { files: string[] }) => {
      setFiles(d.files);
      const first = d.files[0];
      if (first) setActive(first.replace(/\.md$/, ''));
    });
  }, []);

  useEffect(() => {
    if (!active) return;
    fetch(`/api/prompts/${active}`)
      .then((r) => r.json())
      .then((d: { content: string }) => setContent(d.content));
  }, [active]);

  const save = async () => {
    if (!active) return;
    setSaving(true);
    await fetch(`/api/prompts/${active}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
      headers: { 'content-type': 'application/json' },
    });
    setSaving(false);
    setSavedAt(Date.now());
    setTimeout(() => setSavedAt(null), 2500);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <label className="text-xs uppercase tracking-[0.18em] text-[var(--color-fade)]">File</label>
        <select
          value={active ?? ''}
          onChange={(e) => setActive(e.target.value)}
          className="input-paper max-w-xs"
        >
          {files.map((f) => (
            <option key={f} value={f.replace(/\.md$/, '')}>
              {f}
            </option>
          ))}
        </select>
      </div>

      <textarea
        className="input-paper h-[28rem] resize-y leading-relaxed"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        spellCheck={false}
      />

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? 'Saving…' : 'Save'}
        </button>
        {savedAt && (
          <span className="text-xs text-[var(--color-patina)]">Saved · next generation will use the new prompt</span>
        )}
      </div>
    </div>
  );
}
