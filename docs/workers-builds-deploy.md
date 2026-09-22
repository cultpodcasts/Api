# Workers Builds (Api)

Api Builds only publishes Api. Survey / US scrape preview is **local ops**.

| Worker | Typical deploy command |
|--------|------------------------|
| **api** | `npx wrangler deploy` or `npm run deploy` |
| **api-preview** | `npx wrangler deploy --env preview` or `npm run deploy -- --env preview` |

## US scrape

| Worker | When |
|--------|------|
| **streaming-scrape-us** (prod) | Product geo prepare — keep deployed |
| **streaming-scrape-us-preview** | Survey / preview geo only — **do not leave running** |

Survey with `-IncludeUsFetch` deploys then deletes the preview twin. Manual:

```powershell
npm run survey:scrape-us:ensure
npm run survey:scrape-us:teardown
npm run deploy:scrape-us   # production only when needed
```

Config: root `wrangler.streaming-scrape-us.jsonc`.

**Note:** api-preview Builds that bind `SCRAPE_US` fail if the preview scrape Worker is missing. Run survey (or `survey:scrape-us:ensure`) before that deploy, then tear down after.

## Survey (local → deployed Api)

```powershell
npm run survey:streaming-scrape -- `
  -ApiBaseUrl https://api-preview.jonbreen.workers.dev `
  -SecretsFile ./scripts/local-secrets.preview.env `
  -ExpectedEdgeLocs GB -ExpectedEdgeColos LHR `
  -IncludeUsFetch -ExpectedUsColos IAD
```

Compare: `npm run survey:compare-contract`. Skill: `.cursor/skills/streaming-scrape-survey/SKILL.md`.
