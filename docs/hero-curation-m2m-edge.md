# Hero curation M2M edge access (Azure → Worker)

## Problem

`api-infra` / `indexer-infra` call Auth0 client-credentials then:

`POST {api__Endpoint}/hero-curation/episodes`

When `api__Endpoint` is `https://api.cultpodcasts.com`, Cloudflare **Bot Fight Mode** on the Free zone sometimes returned challenge HTML (**“Just a moment…”**, HTTP Forbidden) **before** the Worker ran. That is **not** an app JWT 403 — JWT auth never saw the request.

## Why a WAF “skip when Bearer” rule is not applied

| Fact | Implication |
|------|-------------|
| Zone plan | **Free Website** (`cultpodcasts.com`) |
| Bot Fight Mode | On Free, **cannot** be skipped with WAF custom rules ([CF interoperability](https://developers.cloudflare.com/waf/feature-interoperability/)) |
| Available API tokens | Wrangler OAuth + Key Vault tokens lack **Zone WAF / Firewall edit** |

So a durable custom rule like “path starts with `/hero-curation` AND `Authorization` starts with `Bearer` → skip Bot Fight / managed challenge” is **not enforceable on this plan**, even with dashboard access for Skip → Super Bot Fight Mode (Pro+ only).

### If the zone is upgraded to Pro (optional future — preferred long-term)

1. Cloudflare Dashboard → **cultpodcasts.com** → **Security** → **Security rules** → **Create rule** → **Custom rules**.
2. Expression (edit as needed):

   ```text
   (starts_with(http.request.uri.path, "/hero-curation") and starts_with(http.request.headers["authorization"][0], "Bearer "))
   ```

3. Action: **Skip** → enable **All Super Bot Fight Mode rules** (and rate-limit/managed if they also false-positive).
4. Deploy/save. Verify with M2M dry-run below against **`https://api.cultpodcasts.com`**.
5. Set Key Vault `Api-Endpoint` (and live `api__Endpoint`) back to `https://api.cultpodcasts.com`.

Until then, do **not** turn off Bot Fight Mode zone-wide just for M2M (weakens public bot protection). Prefer an alternate edge host via **Azure-only secret** (below).

## Applied durable fix (live) — secret only, never in git

Server-to-server traffic may use the Worker’s **workers.dev** hostname (same script, **no** zone Bot Fight). That host is **personal/account-specific** and must **never** be committed in RPP bicep, appsettings, or this repo’s docs as a literal URL.

| Setting | Where | Notes |
|---------|--------|--------|
| Azure `api__Endpoint` | `api-infra`, `indexer-infra` app settings | Live bypass host — Azure-only |
| Key Vault `Api-Endpoint` | `cultpodcasts-deployment` | Deploy-time source for bicep `@secure()` `apiEndpoint` → literal `api__Endpoint` |
| RPP committed source | `https://api.cultpodcasts.com` defaults / KV reference only | **No** `*.workers.dev` in git |

**Unchanged:** public website / browser clients keep using `https://api.cultpodcasts.com`. Auth0 audience remains `https://api.cultpodcasts.com/`. Worker JWT checks are unchanged — workers.dev does **not** weaken public auth.

Operator commands (RPP `docs/deployment.md` § Edge API endpoint):

```powershell
az keyvault secret set --vault-name cultpodcasts-deployment --name 'Api-Endpoint' --value '<edge-base-url>'
az functionapp config appsettings set -g AutomatedInfra -n api-infra --settings api__Endpoint='<edge-base-url>'
az functionapp config appsettings set -g AutomatedInfra -n indexer-infra --settings api__Endpoint='<edge-base-url>'
```

Use the Worker workers.dev URL from Wrangler/dashboard when bypassing Bot Fight; use `https://api.cultpodcasts.com` when Pro WAF skip is in place.

## Verify (dry-run — no hero DO write)

Empty `episodeIds` fails Zod `min(1)` → **400** if the request reached the Worker (success path for this probe):

```powershell
# Obtain M2M access_token via Auth0 client_credentials (audience https://api.cultpodcasts.com/)
# $edge = value of live api__Endpoint (KV Api-Endpoint) — do not hardcode workers.dev in scripts you commit
Invoke-WebRequest `
  -Uri "$edge/hero-curation/episodes" `
  -Method POST `
  -Headers @{ Authorization = "Bearer $token"; 'Content-Type' = 'application/json' } `
  -Body '{"episodeIds":[]}' `
  -SkipHttpErrorCheck
# Expect: StatusCode 400, body {"error":"Bad request"} — not challenge HTML
```

Challenge HTML / `cf-mitigated: challenge` = still blocked at the edge.

## Related

RedditPodcastPoster: `docs/deployment.md` (§ Edge API endpoint), `Infrastructure/functions.bicep` / `functions.bicepparam` (`Api-Endpoint` secret).
