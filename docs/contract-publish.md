# Streaming-submit contract → GitHub Packages (**deferred**)

GitHub Packages billing is blocked for now. **Do not** wire `deploy:*:with-contract` into Workers Builds until that is fixed. Prefer sibling contract copies (website / RPP PRs).

When unblocked, see publish scripts below and [`workers-builds-deploy.md`](./workers-builds-deploy.md) for chaining with scrape + Api.

## Channels (when enabled)

| Channel | When | npm version | dist-tag |
|---------|------|-------------|----------|
| **production** | Top-level Worker **`api`** production deploy | `package.json` semver | `latest` |
| **staging** | Worker **`api-preview`** deploy | `{semver}-staging.{sha7}` | `staging` |

Artefacts: `streaming-submit-contract.ts` + `.json` from `tests/fixtures/`.

## Scripts (manual / future CI)

```powershell
npm run publish:contract:staging
npm run publish:contract:production
# later, with Packages working:
# npm run deploy:preview:with-contract
# npm run deploy:with-contract
```

Requires `NODE_AUTH_TOKEN` (classic PAT `write:packages`) as a **Builds** secret — not a Worker runtime secret.

## Consumers

```bash
npm i @cultpodcasts/streaming-submit-contract@latest
npm i @cultpodcasts/streaming-submit-contract@staging
```

Until Packages works: keep byte-copy asserts / companion PRs.

