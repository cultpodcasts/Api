# BR field probe (Cloudflare edge) — on-demand, not CI

Runs **real Cloudflare Browser Rendering** against a JSON list of streaming URLs and asserts usable-HTML signals (same policy as Api prepare salvage: og / next-data / json-ld / twitter, min length, not challenge).

## URL catalog

Edit [`field-urls.json`](./field-urls.json):

```json
{
  "targets": [
    {
      "id": "itvx-children-of-the-cult",
      "service": "itvx",
      "url": "https://www.itv.com/watch/...",
      "enabled": true,
      "notes": "…"
    }
  ]
}
```

- Set `enabled: true` and a real `url` to include a provider.
- Placeholders ship `enabled: false` so the default run only hits the known-good ITVX example until you add more.
- The Worker **imports** this file; changing it requires restarting `wrangler` / re-running the npm script.

## Run (on demand)

```powershell
npm run test:br:field          # all enabled targets in field-urls.json
npm run test:br:itvx           # filter service=itvx
pwsh ./scripts/br-field-probe/run-field-test.ps1 -Service channel4
pwsh ./scripts/br-field-probe/run-field-test.ps1 -Url "https://…" -Service netflix
```

Writes `out/field-test-result.json` (gitignored). Exit `0` = all targets usable; `1` = any failure.

**Not part of CI.** Do not add these scripts to `.github/workflows/test.yml`.

### Worker API

| Request | Behaviour |
|---------|-----------|
| `GET /?compact=1` | All enabled catalog targets |
| `GET /?compact=1&service=itvx` | Catalog filtered by service |
| `GET /?compact=1&url=…` | Single ad-hoc URL |
| `POST /` + `{ "targets": [ … ] }` | Override catalog for this request |
| `POST /` + `{ "urls": [ "https://…", … ] }` | Ad-hoc URL list |

## Optional workers.dev deploy

```powershell
cd scripts/br-field-probe
npx wrangler deploy
```

Then `GET https://br-field-probe.<subdomain>.workers.dev/?compact=1`

## Vs prepare smoke

| Tool | What it proves |
|------|----------------|
| `npm run test:br:field` | Raw CF BR + usable signals across providers in JSON |
| `scripts/submit-prepare-field-smoke.ps1` | Full Api `POST /submit/prepare` on a remote Worker |
