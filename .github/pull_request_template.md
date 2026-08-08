## Summary

<!-- 1–3 bullets: what and why -->

## Config / secrets

<!-- Required when this PR adds or depends on new Cloudflare Worker secrets / endpoint URLs.
     List **names only** (never values). Tick both environments before merge/release. -->

- [ ] No new Worker secrets / endpoint env keys
- [ ] **Or** new secret **names** (preview + production):
  - Preview (`api-preview`): `<!-- e.g. secureExampleEndpoint -->`
  - Production (top-level Worker `api` — **not** `--env production`): `<!-- same names -->`
- [ ] Tracked examples updated: `scripts/local-secrets.preview.env.example` + `scripts/local-secrets.production.env.example`
- [ ] Upload scripts updated: `set-secrets-preview.ps1` + `set-secrets-production.ps1`
- [ ] `pwsh ./scripts/assert-secrets-example-parity.ps1` clean

At deploy time: read this section and set every named key on **both** Workers before calling the release done.

## Test plan

- [ ]
