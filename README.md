# Api

The API is the endpoint queries by the Website project.

It is currently hosted as a Cloudflare Worker with a Durable Object for User-profiles.

A D1-database (using Prisma) is used for storing anonymous user-submissions.

## Running locally

Use:

```bash
npm run start
```

This runs Wrangler with the `local` environment (`wrangler dev --env local`).

Local development uses HTTPS with a custom trusted certificate and listens on `127.0.0.1:8787`:

`wrangler dev --env local --ip 127.0.0.1 --port 8787 --local-protocol https --https-cert-path ./.cert/dev-cert.pem --https-key-path ./.cert/dev-key.pem`

### Why `env.local` exists

`wrangler.jsonc` keeps top-level production migrations (`v1`, `v2`, `v3`) unchanged for deploys, and also defines per-environment migrations:

| Env | Worker name | Profile DO storage |
|-----|-------------|--------------------|
| *(default)* | `api` | Top-level `v1`→`v3` (SQLite via `new_sqlite_classes`) |
| `local` | local only | `local-v1` with `new_sqlite_classes` |
| `preview` | `api-preview` | Cut over via `preview-v2` (rename KV aside + SQLite) then `preview-v3` (delete legacy). **Already applied on api-preview.** |
| `production` | `api-production` | Same cutover prepared (`production-v2`); deploy with the temporary `PROFILE_DURABLE_OBJECT_LEGACY` binding, then remove that binding and add `production-v3` `deleted_classes` in a follow-up deploy. Default prod uses top-level `api`, not this env. |

`env.local` avoids the local Durable Object replay error:

`Cannot apply new_sqlite_classes migration to existing class ProfileDurableObject`

`ProfileDurableObject` uses `ctx.storage.sql`, which **requires** a SQLite-backed class (`new_sqlite_classes`). A preview/production named-env class created with only `new_classes` (KV) will throw on bookmark routes (Worker 500).

Default production deploys use the top-level migration history:

```bash
npm run deploy
```

Preview (e.g. `api-preview.<account>.workers.dev`):

```bash
npx wrangler deploy --env preview
```

### Workers Builds (Git deploy)

Do **not** rely on a local `wrangler deploy` for shared hosts. Cloudflare Workers Builds deploys from Git:

| Worker | Git Builds | Deploy command | Triggers |
|--------|------------|----------------|----------|
| `api` | connected | `npx wrangler deploy` | `main` only |
| `api-preview` | connected | `npx wrangler deploy --env preview` | `main` + PR branches |

Both Workers use build command `./build.sh` and the same repo (`cultpodcasts/Api`). On **api-preview**, enable **Builds for non-production branches** and set the non-production deploy command to `npx wrangler deploy --env preview` (not the default `versions upload`) so PR pushes update the shared `api-preview` host.

**Caveat:** concurrent open PRs overwrite each other on `api-preview` (latest successful build wins). That matches the single staging API URL the website uses.

Dashboard: [api Builds](https://dash.cloudflare.com/bae3f835f19899c6eee1ec48f2d658cf/workers/services/view/api/production/settings) · [api-preview Builds](https://dash.cloudflare.com/bae3f835f19899c6eee1ec48f2d658cf/workers/services/view/api-preview/production/settings).

## Hero auto-promote (Azure M2M)

Azure Functions append hero episodes via Auth0 M2M → `POST /hero-curation/episodes`. Committed defaults use **`https://api.cultpodcasts.com`**. Free-plan Bot Fight Mode can challenge M2M against the custom domain; production may temporarily use the Worker **workers.dev** host via Key Vault secret **`Api-Endpoint`** / Azure `api__Endpoint` only — **never commit a personal workers.dev URL**. Long-term: Pro WAF skip for Bearer on `/hero-curation`. Public browsers stay on the custom domain.

Full detail and operator steps: [docs/hero-curation-m2m-edge.md](docs/hero-curation-m2m-edge.md).
