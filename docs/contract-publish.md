# Streaming-submit contract → GitHub Packages (**deferred**)

Publishing *this repo's* streaming-submit contract to GitHub Packages is deferred (billing was blocked). **Do not** wire `deploy:*:with-contract` into Workers Builds until that is revisited. Prefer sibling contract copies (website / RPP PRs). This is separate from *consuming* `@cultpodcasts/contracts` (published from RedditPodcastPoster), which is live: `npm ci` installs it from GitHub Packages with a `read:packages` PAT ([`workers-builds-deploy.md`](./workers-builds-deploy.md#build-variable-node_auth_token-required)).

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

