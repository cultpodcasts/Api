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

Preview (e.g. `api-preview.jonbreen.workers.dev`):

```bash
npx wrangler deploy --env preview
```