import { readFile } from 'node:fs/promises';
import { promptPath } from './paths.ts';

const NAME_RE = /^[a-z0-9-]+$/;

export async function loadPrompt(name: string): Promise<string> {
    if (!NAME_RE.test(name)) {
        throw new Error(`invalid prompt name: ${name}`);
    }
    return await readFile(promptPath(name), 'utf8');
}
