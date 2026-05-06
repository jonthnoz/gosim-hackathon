import { PromptEditor } from './prompt-editor';
import { BrandingEditor } from './branding-editor';

export default function SettingsPage() {
  return (
    <main className="max-w-3xl mx-auto px-8 pt-12 pb-20 w-full">
      <header className="mb-12">
        <h1
          className="font-display text-[56px] leading-[1.04] tracking-[-0.02em] text-[var(--color-ink)]"
          style={{ fontVariationSettings: '"opsz" 144' }}
        >
          Settings
        </h1>
        <p className="mt-4 text-[var(--color-ink-soft)] text-sm">
          The pieces of Lensbnb you can rewire without touching code.
        </p>
      </header>

      <div className="space-y-14">
        <section>
          <SectionHead
            label="Prompts"
            hint="Edit the M2 narrative-arc prompt. Saved files are picked up by the next reel — no restart needed."
          />
          <PromptEditor />
        </section>

        <section>
          <SectionHead
            label="Branding"
            hint="The watermark applied to every generated reel."
          />
          <BrandingEditor />
        </section>

        <section>
          <SectionHead
            label="Connections"
            hint="Where reels are published. Real OAuth is out of scope for v0.1."
          />
          <ul className="text-sm divide-y divide-[var(--color-line-soft)] border border-[var(--color-line-soft)] rounded-md bg-[var(--color-card)]">
            <ConnectionRow platform="Instagram" handle="@lensbnb_demo" />
            <ConnectionRow platform="TikTok" handle="@lensbnb_demo" />
          </ul>
        </section>
      </div>
    </main>
  );
}

function SectionHead({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="mb-5 flex items-baseline justify-between gap-6 hairline pt-6">
      <h2
        className="font-display text-2xl text-[var(--color-ink)]"
        style={{ fontVariationSettings: '"opsz" 36' }}
      >
        {label}
      </h2>
      <p className="text-xs text-[var(--color-fade)] max-w-md text-right leading-relaxed">
        {hint}
      </p>
    </div>
  );
}

function ConnectionRow({ platform, handle }: { platform: string; handle: string }) {
  return (
    <li className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-patina)]" aria-hidden />
        <span className="text-[var(--color-ink)]">{platform}</span>
        <span className="font-mono text-xs text-[var(--color-ink-soft)]">{handle}</span>
      </div>
      <span className="text-xs text-[var(--color-fade)] uppercase tracking-[0.18em]">Mock</span>
    </li>
  );
}
