# Streaming-submit contract → GitHub Packages

Api publishes `@cultpodcasts/streaming-submit-contract` from **Cloudflare Workers Builds** (GitHub Actions are not required).

| Channel | When | npm version | dist-tag |
|---------|------|-------------|----------|
| **production** | Top-level Worker **`api`** production deploy | `package.json` semver (e.g. `1.1.31`) | `latest` |
| **staging** | Worker **`api-preview`** deploy | `{semver}-staging.{sha7}` | `staging` |

Artefacts in the package:

- `streaming-submit-contract.ts` — website
- `streaming-submit-contract.json` — RPP / tooling

Source of truth: `tests/fixtures/streaming-submit-contract.*` (copied at publish time).

## Workers Builds settings

### Secret (both `api` and `api-preview` Builds)

| Build secret | Value |
|--------------|--------|
| `NODE_AUTH_TOKEN` | GitHub PAT (classic `write:packages` + `repo`, or fine-grained: Packages write on `cultpodcasts/Api`) |

Create under Worker → **Settings** → **Build** → **Build variables and secrets** (not `wrangler secret put` — build-only).

### Deploy commands

**`api` (production):**

```bash
npm run deploy:with-contract
```

(= `publish:contract:production` then `wrangler deploy`)

**`api-preview`:**

```bash
npm run deploy:preview:with-contract
```

(= `publish:contract:staging` then `wrangler deploy --env preview`)

Non-production / preview-branch commands on `api` should **not** publish production (keep default `wrangler versions upload` / no publish). Staging publish belongs on **`api-preview`** builds.

## Local publish (ops)

```powershell
$env:NODE_AUTH_TOKEN = "<pat>"
npm run publish:contract:staging
# or
npm run publish:contract:production
```

Do not commit the token. Prefer CI.

## Consumers

```ini
@cultpodcasts:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

```bash
npm i @cultpodcasts/streaming-submit-contract@latest    # production
npm i @cultpodcasts/streaming-submit-contract@staging   # Api preview track
```

Sibling byte-copy asserts remain until website/RPP fully switch to the package.

## First-time GitHub Packages

1. Ensure the GitHub org allows package creation from this repo.
2. PAT / `NODE_AUTH_TOKEN` needs **`write:packages`** (and usually `read:packages`) — `repo` alone is not enough. Fine-grained: Packages **Read and write** on `cultpodcasts/Api` (or org).
3. First successful publish creates `https://github.com/orgs/cultpodcasts/packages?repo_name=Api`.
4. Grant website / RPP CI read access to the package (or inherit from org).

## Workers Builds deploy commands (required)

After merging this wiring, set in the dashboard (Build settings):

| Worker | Deploy command |
|--------|----------------|
| **api** | `npm run deploy:with-contract` |
| **api-preview** | `npm run deploy:preview:with-contract` |

Default `npx wrangler deploy …` does **not** publish the contract.
