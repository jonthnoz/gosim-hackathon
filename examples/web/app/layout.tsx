import type { Metadata } from 'next';
import { Geist, Geist_Mono, Fraunces } from 'next/font/google';
import './globals.css';
import { NavLink } from '@/components/nav-link';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const fraunces = Fraunces({
  variable: '--font-fraunces',
  subsets: ['latin'],
  axes: ['opsz'],
  style: ['normal', 'italic'],
});

export const metadata: Metadata = {
  title: 'Lensbnb — listings to reels',
  description: 'A Parisian short-stay reel generator.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="bg-[var(--color-paper)]">
          <div className="max-w-6xl mx-auto px-8 pt-7 pb-5 flex items-end justify-between">
            <a href="/" className="flex items-baseline gap-2.5 group">
              <img
                src="/lensbnb-mark.png"
                alt=""
                className="h-7 w-7 self-center -translate-y-px transition-transform group-hover:rotate-[8deg]"
              />
              <span
                className="font-display text-3xl tracking-tight italic font-light text-[var(--color-ink)]"
                style={{ fontVariationSettings: '"opsz" 96' }}
              >
                lensbnb
              </span>
            </a>
            <nav className="flex items-center gap-6 text-sm pb-1">
              <NavLink />
            </nav>
          </div>
          <div className="hairline max-w-6xl mx-auto" />
        </header>
        {children}
      </body>
    </html>
  );
}
