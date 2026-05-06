// pipeline/paths.ts — layered repo-root resolver.
// Order: LENSBNB_REPO_ROOT env override > guarded import.meta.url > cwd-walk fallback.
// All three validated against marker directories (prompts/, brand/) before being accepted.
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_MARKERS = ['prompts', 'brand'] as const;

function isRepoRoot(candidate: string): boolean {
    return REQUIRED_MARKERS.every((m) => existsSync(resolve(candidate, m)));
}

function fromImportMeta(): string | null {
    try {
        const url = import.meta.url;
        if (!url || !url.startsWith('file://')) return null; // Turbopack virtual /ROOT/, etc.
        const here = dirname(fileURLToPath(url));
        const root = resolve(here, '..');
        return isRepoRoot(root) ? root : null;
    } catch {
        return null;
    }
}

function fromCwdWalk(): string | null {
    let dir = process.cwd();
    for (let i = 0; i < 6; i++) {
        if (isRepoRoot(dir)) return dir;
        const parent = dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    return null;
}

function resolveRepoRoot(): string {
    const override = process.env['LENSBNB_REPO_ROOT'];
    if (override) {
        const abs = resolve(override);
        if (!isRepoRoot(abs)) {
            throw new Error(`LENSBNB_REPO_ROOT=${abs} missing prompts/ or brand/`);
        }
        return abs;
    }
    const root = fromImportMeta() ?? fromCwdWalk();
    if (!root) {
        throw new Error(
            'Could not locate repo root. Set LENSBNB_REPO_ROOT to the directory containing prompts/ and brand/.',
        );
    }
    return root;
}

export const REPO_ROOT = resolveRepoRoot();
export const promptsDir = (): string => join(REPO_ROOT, 'prompts');
export const promptPath = (name: string): string => join(promptsDir(), `${name}.md`);
export const brandDir = (): string => join(REPO_ROOT, 'brand');
export const brandingPath = (): string => join(brandDir(), 'branding.json');
export const watermarkPath = (): string => join(brandDir(), 'lensbnb-mark.png');
export const logoPath = (): string => join(brandDir(), 'lensbnb-logo.png');
export const envPath = (): string => join(REPO_ROOT, '.env');
