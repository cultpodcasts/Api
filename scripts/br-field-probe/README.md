# BR field probe — same code path as prepare (not CI)

Exercises **production** `src/browserRenderingHtml.ts` (`fetchHtmlWithBrowserRendering` + `isUsableBrowserHtml`) via a remote Cloudflare Browser binding.

**Do not** reimplement Puppeteer goto / UA / settle in this Worker. A green probe that uses different browser settings than Api prepare does **not** prove prepare will work.

## URL catalog

Edit [`field-urls.json`](./field-urls.json) — set `enabled: true` and real episode URLs per streaming `service`.

## Run (on demand)

```powershell
npm run test:br:field          # all enabled targets
npm run test:br:itvx           # service=itvx only
```

Writes `out/field-test-result.json` (gitignored). Exit `0` = all targets usable per **production** `isUsableBrowserHtml`.

**Not part of CI.**

## US placement (Hulu / geo)

Default [`wrangler.jsonc`](./wrangler.jsonc) has **no** `placement.region` (edge colo). For US-geo catalogue walls (Hulu), use:

```powershell
npx wrangler dev -c ./scripts/br-field-probe/wrangler.us-east.jsonc --ip 127.0.0.1
# then GET /?compact=1&url=<hulu-series-url>
```

[`wrangler.us-east.jsonc`](./wrangler.us-east.jsonc) sets `placement.region: aws:us-east-1` (same pin as production Worker `streaming-scrape-us`). After that Worker is deployed, prefer probing it via Api prepare (`SCRAPE_US` service binding) rather than this temporary probe.

Heaven’s Gate specimen (ops): `https://www.hulu.com/series/heavens-gate-the-cult-of-cults-3de513f8-ee47-44d4-98c8-f6910ce4ee9b` — expect title containing the series name and `finalUrl` on `hulu.com` (not Disney+ marketing).

## Worker API

| Request | Behaviour |
|---------|-----------|
| `GET /?compact=1` | All enabled catalog targets via production BR helper |
| `GET /?compact=1&service=itvx` | Filtered catalog |
| `GET /?compact=1&url=…` | Single ad-hoc URL |
| `POST /` + `{ "targets": [ … ] }` | Override catalog |
