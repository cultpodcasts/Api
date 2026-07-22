# Cloudflare Worker secrets (Api)

Worker secrets (Search API key, Auth0 client id, Azure Function endpoint URLs, etc.) must **never** be committed to git.

## Preferred pattern

1. Copy the tracked example file:
   - Preview: `scripts/local-secrets.preview.env.example` → `scripts/local-secrets.preview.env`
   - Production: `scripts/local-secrets.production.env.example` → `scripts/local-secrets.production.env`
2. Fill real values in the `.env` copy (gitignored).
3. Run:
   - `.\scripts\set-secrets-preview.ps1` or `scripts\set-secrets-preview.cmd`
   - `.\scripts\set-secrets-production.ps1` or `scripts\set-secrets-production.cmd`

The scripts read `KEY=VALUE` lines and pipe each value to `npx wrangler secret put <KEY> --env <preview|production>`.

Process environment variables with the same key names override file values if set.

## Local Wrangler / Pages vars

- `.dev.vars` — local Worker secrets for `wrangler dev` (gitignored).
- `.env` — also gitignored; do not commit.

## Gitignore

These paths are ignored (do not track):

- `.dev.vars`
- `.env`
- `.env.*` (except `*.example` if added later under scripts)
- `scripts/local-secrets.*.env` (real values only; `*.env.example` is tracked)

Tracked scripts (`set-secrets-*.ps1` / `.cmd`) contain **no** real secrets or `*.azurewebsites.net` hosts — only loaders and placeholder examples.

## After a historical plaintext leak

Rotate the Azure Cognitive Search API key (and any other exposed credentials) in Azure / Auth0, then re-run the set-secrets script from your local file.
