# Cloudflare Worker secrets (Api)

Worker secrets (Search API key, Auth0 client id, Azure Function endpoint URLs, etc.) must **never** be committed to git.

## Preview ↔ production parity (required)

New secrets added for preview/staging **must** be mirrored for production. Forgetting this has caused production 500s on release (Aug 2026: supported-languages / title-casing endpoint secrets).

| Requirement | Detail |
|-------------|--------|
| Same **key names** | Preview and production `.env.example` files + both `set-secrets-*.ps1` lists |
| PR documents names | PR body section **`## Config / secrets`** lists every new secret **name** (never values) for preview **and** production |
| Deploy reads the PR | Before calling a release done, set each named key on both Workers |
| Live production target | Top-level Worker **`api`** via `.\scripts\set-secrets-production.ps1` (`--env=`). **Not** `--env production` (`api-production`) |

Mechanical check:

```powershell
pwsh ./scripts/assert-secrets-example-parity.ps1
```

Agent rule: [`.cursor/rules/preview-production-secrets-parity.mdc`](../.cursor/rules/preview-production-secrets-parity.mdc).

## Preferred pattern

1. Copy the tracked example file:
   - Preview: `scripts/local-secrets.preview.env.example` → `scripts/local-secrets.preview.env`
   - Production: `scripts/local-secrets.production.env.example` → `scripts/local-secrets.production.env`
2. Fill real values in the `.env` copy (gitignored).
3. Run:
   - `.\scripts\set-secrets-preview.ps1` or `scripts\set-secrets-preview.cmd`
   - `.\scripts\set-secrets-production.ps1` or `scripts\set-secrets-production.cmd`

The scripts read `KEY=VALUE` lines and pipe each value to `npx wrangler secret put`:

- Preview → `--env preview` (`api-preview`)
- Production → top-level Worker `api` (`--env=` / no named env). **Not** `--env production` — that targets a separate `api-production` service that does not serve `api.cultpodcasts.com`.

Process environment variables with the same key names override file values if set.

## Local Wrangler / Pages vars

- `.dev.vars` — local Worker secrets for `wrangler dev` (gitignored). Copy keys from `scripts/local-secrets.preview.env.example` (includes `secureDiscoveryScheduleEndpoint`, `secureSupportedLanguagesEndpoint`, `secureTitleCasingRulesEndpoint`, and other Azure Function proxy URLs).
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
