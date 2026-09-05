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

## Worker API

| Request | Behaviour |
|---------|-----------|
| `GET /?compact=1` | All enabled catalog targets via production BR helper |
| `GET /?compact=1&service=itvx` | Filtered catalog |
| `GET /?compact=1&url=…` | Single ad-hoc URL |
| `POST /` + `{ "targets": [ … ] }` | Override catalog |
