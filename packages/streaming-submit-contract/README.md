# `@cultpodcasts/streaming-submit-contract`

Canonical streaming-submit contract for **website** (TypeScript) and **RPP** (JSON).

Source of truth remains Api fixtures:

- `tests/fixtures/streaming-submit-contract.ts`
- `tests/fixtures/streaming-submit-contract.json`

This package is **assembled and published** during Cloudflare Workers Builds (not hand-edited). See [`docs/contract-publish.md`](../../docs/contract-publish.md).

## Install (consumers)

GitHub Packages auth (`.npmrc`):

```ini
@cultpodcasts:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

```bash
# Production (semver / latest)
npm i @cultpodcasts/streaming-submit-contract@latest

# Staging (Api preview builds)
npm i @cultpodcasts/streaming-submit-contract@staging
```

### Website

```ts
import { resolveScrapeProfile, streamingServiceKeys } from "@cultpodcasts/streaming-submit-contract";
```

### RPP

Use the JSON export (copy into `docs/contracts/` or read from `node_modules`):

```text
node_modules/@cultpodcasts/streaming-submit-contract/streaming-submit-contract.json
```

Or: `import pkg from "@cultpodcasts/streaming-submit-contract/json" assert { type: "json" }` in Node tooling.
