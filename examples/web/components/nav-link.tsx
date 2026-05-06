'use client';
import { usePathname } from 'next/navigation';

/**
 * Top-right nav link. On `/` it reads "Settings"; on `/settings` (or any other
 * route) it reads "← Home" and points back to `/`.
 */
export function NavLink() {
  const pathname = usePathname();
  const onHome = pathname === '/';
  if (onHome) {
    return (
      <a href="/settings" className="text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] transition-colors">
        Settings
      </a>
    );
  }
  return (
    <a href="/" className="text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] transition-colors">
      ← Home
    </a>
  );
}
