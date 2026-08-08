# Cult Podcasts API Worker — agent notes

Cloudflare Worker gateway (`api` / `api-preview`) in front of Azure Functions (`api-infra`).

## Preview ↔ production secrets (HARD)

Any new Worker secret for preview/staging **must** also be planned for production.

- Rule: [`.cursor/rules/preview-production-secrets-parity.mdc`](.cursor/rules/preview-production-secrets-parity.mdc)
- Docs: [`docs/worker-secrets.md`](docs/worker-secrets.md)
- PR body **must** include `## Config / secrets` with **secret names** (never values)
- Parity check: `pwsh ./scripts/assert-secrets-example-parity.ps1`
- Live production secrets go on top-level Worker **`api`** (`set-secrets-production.ps1` / `--env=`). Do **not** use `--env production` (that is `api-production`, not serving `api.cultpodcasts.com`).

## Version

Semver patch (or higher) in `package.json` + `package-lock.json` on every shipping PR.
