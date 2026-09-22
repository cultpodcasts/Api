# Workers Builds deploy commands (Api)

`npm run deploy` publishes the US scrape Worker **first**, then Api (see `scripts/cf-deploy.mjs`).

| Worker Builds | Deploy command |
|---------------|----------------|
| **api** (production) | `npm run deploy` |
| **api-preview** | `npm run deploy -- --env preview` |

Under Workers Builds, wrangler receives `WRANGLER_CI_OVERRIDE_NAME` for the connected Worker. The scrape step temporarily sets that to `streaming-scrape-us` / `streaming-scrape-us-preview` so the binding target can publish.

Build command can stay `./build.sh`. Do **not** use `deploy:*:with-contract` until GitHub Packages billing works.