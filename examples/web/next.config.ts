import type { NextConfig } from 'next';

const config: NextConfig = {
    // Allow imports from outside examples/web/ — required for `@pipeline/*` files
    // (which live at the repo root). Without this, Next 15's compiler refuses to
    // transpile TS files outside its app root.
    experimental: { externalDir: true },
};

export default config;
