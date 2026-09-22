# `@cultpodcasts/streaming-submit-contract`

Canonical streaming-submit contract for **website** (TypeScript) and **RPP** (JSON).

Source of truth remains Api fixtures:

- `tests/fixtures/streaming-submit-contract.ts`
- `tests/fixtures/streaming-submit-contract.json`

**GitHub Packages publish is deferred** (billing). Do **not** treat Workers Builds as
assembling/publishing this package yet — see [`docs/contract-publish.md`](../../docs/contract-publish.md).
Until unblocked, keep sibling byte-copies in website / RPP.

Manual publish scripts exist for when Packages works (`npm run publish:contract:staging` /
`publish:contract:production`) — **do not** wire them into Builds until then.

## Install (consumers) — when Packages is enabled

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
