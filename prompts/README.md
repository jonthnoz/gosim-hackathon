# Prompts

Each `*.md` file in this directory is a prompt the pipeline reads at run time. Edit any file and the **next** generation will pick it up — no restart needed.

## `script.md`

The single LLM prompt sent to MiniMax-M2 for each reel. Generates the entire script JSON: hookText, narration, image prompts (title/lifestyle/end), music prompt, caption, hashtags.

**Inputs (Mustache `{{...}}` placeholders):**
- `name` — listing name
- `neighborhood`, `city` — for context
- `external_url` — listing URL (back-link)
- `description` — markdown blob from `listings.description`. Source of truth — M2 is instructed to mention ONLY facts present here.

**Output:** strict JSON object with the fields above. Pipeline parses and validates.

**Editing tips:**
- The grounding rules are load-bearing — without them M2 hallucinates listing features.
- Keep the JSON shape stable; the pipeline parser expects exactly these fields.
- Extending: if you add a new field to the JSON, also add a parser field in `pipeline/generate-script.ts`.
