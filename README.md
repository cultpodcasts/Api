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

### Why `env.local` exists

`wrangler.jsonc` keeps production migrations (`v1`, `v2`, `v3`) unchanged for deploys, and also defines `env.local.migrations` with a local baseline migration for `ProfileDurableObject`.

This avoids the local Durable Object replay error:

`Cannot apply new_sqlite_classes migration to existing class ProfileDurableObject`

Deploys still use the top-level production migration history:

```bash
npm run deploy
```