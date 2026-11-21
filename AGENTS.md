# Cult Podcasts API Worker — agent notes

Cloudflare Worker gateway (`api` / `api-preview`) in front of Azure Functions (`api-infra`).

## No deploys (HARD)

**Never** run `wrangler deploy` / `npm run deploy` (preview or production) unless the user
explicitly names that exact deploy in the current conversation. Git push to a PR branch is OK
when asked; do not treat “enable” / “ship” / feature flips as deploy approval.

- Rule: [`.cursor/rules/no-api-website-deploys.mdc`](.cursor/rules/no-api-website-deploys.mdc)

## Auth0 permissions (Worker)

JWT **`permissions[]`** and OAuth **`scope`** are checked via `hasPermission` (not ID-token roles). Submit/lookup Azure gate: `canCallAzureSubmitBackend` in `src/submitAccess.ts` (`submit` or `curate`).

- Cross-repo map: [`website/cultpodcasts/docs/auth0-roles-and-permissions.md`](../website/cultpodcasts/docs/auth0-roles-and-permissions.md)

## Planned catalogue content types epic (not scheduled)

Separate TvShow / **Film** (made-as-film one-off, cinema or TV; no parent) / News Cosmos containers + unified search `contentKind` (`Episode | TvShowEpisode | Film | NewsReport`). Worker search passthrough, kind-aware page-details/shortener, and new proxy routes — **planning only** until a phase is explicitly started. Phase 0 sign-off 2026-09-23. Do not use product name Movie.

RPP docs:

- Epic: `RedditPodcastPoster/docs/catalogue-content-types-epic.md`
- Search storage impact: `RedditPodcastPoster/docs/catalogue-content-types-search-storage-impact.md`

## Preview ↔ production secrets (HARD)

Any new Worker secret for preview/staging **must** also be planned for production.

- Rule: [`.cursor/rules/preview-production-secrets-parity.mdc`](.cursor/rules/preview-production-secrets-parity.mdc)
- Docs: [`docs/worker-secrets.md`](docs/worker-secrets.md)
- PR body **must** include `## Config / secrets` with **secret names** (never values)
- Parity check: `pwsh ./scripts/assert-secrets-example-parity.ps1`
- Live production secrets go on top-level Worker **`api`** (`set-secrets-production.ps1` / `--env=`). Do **not** use `--env production` (that is `api-production`, not serving `api.cultpodcasts.com`).

## CQRS (HARD)

A command changes state and returns an acknowledgement (empty 202) or a command outcome. It does not return the resource read model. A query returns the read model and changes nothing.

The Worker proxies that contract. OpenAPI for an acknowledgement is an empty body. Do not document or require a resource body on an acknowledgement. A proxied command that returns the resource is a CQRS breach. After an acknowledgement, the client GETs the resource.

Authoritative: `RedditPodcastPoster/Cloud/Api/architecture.md` § CQRS.

## Streaming submit orchestration (contracts)

Cross-repo streaming ingest (membership `service`, prepare HTML fetch, BR allowlist): canonical fixture + rules in [`docs/streaming-submit-orchestration.md`](docs/streaming-submit-orchestration.md). Prefer GitHub Packages `@cultpodcasts/streaming-submit-contract` ([`docs/contract-publish.md`](docs/contract-publish.md)); do not fork enums.

## Version

Semver patch (or higher) in `package.json` + `package-lock.json` on every shipping PR. A new cross-client contract is a **minor** bump.

## Review gate (HARD, cultpodcasts/RedditPodcastPoster#1507)

`.github/workflows/review-gate.yml` publishes the commit status **`review-gate`** on every PR head SHA. It is red until the review-implement-pr reviewer says the **current head commit** is acceptable, so a PR cannot be merged mid-review. It does **not** look at CI: CI must be green separately.

The reviewer's **final step** when its verdict is acceptable:

1. Check that every other check for the head SHA has passed (`gh pr checks <n>`). Never mark a SHA while CI is pending or red.
2. Post a PR **issue comment** (`gh pr comment <n>`) containing the marker for the **full 40-character head SHA** it reviewed. The summary can stay a COMMENT review; the marker goes in a separate one-line comment if needed:
   `<!-- review-gate: acceptable sha=<head sha> -->`
   Get the SHA with `gh pr view <n> --json headRefOid --jq .headRefOid`. To withdraw a verdict, post `<!-- review-gate: changes-requested sha=<head sha> -->`.
3. **Then** add the label: `gh pr edit <n> --add-label review-acceptable` (marker first: a label without an acceptable marker for the head SHA is removed).
4. Check `review-gate` is green (`gh pr checks <n>`), then move the card to Ready For Review.

Rules:

- Only the reviewer adds the marker and label. The implementor never does.
- Markers count only in PR issue comments from OWNER, MEMBER or COLLABORATOR accounts. Markers in **review bodies**, on quoted (`>`) lines, inside fenced code blocks, or for any other SHA are ignored. Comments are ordered by when they were created, so editing an old comment does not make its marker the latest; within one comment the last marker wins.
- Any new push removes `review-acceptable` and turns the status red. That includes **merging main into the PR**: with "require branches to be up to date" on, that is a new SHA, so the reviewer must re-check and re-mark it. This is intended.
- The workflow runs only on `pull_request_target` and `issue_comment`, which both use the workflow file and script from `main`, so editing the gate in a PR does not change that PR's result. `pull_request_review` is deliberately not a trigger, because it would run the PR's own copy of the workflow.
- **Process interlock, not a security boundary.** The reviewer, the implementor and Jon all post as `cultpodcasts` (author association OWNER), and anyone with write access can add the label or post a status. "Only the reviewer marks" is enforced by agent rules, not by GitHub. (Possible future hardening: a separate reviewer GitHub App, with markers accepted only from its bot login.)
- The job is named `publish-status`, not `review-gate`, so the only thing called `review-gate` is the commit status. GitHub would otherwise require a check run and a status of the same name.
- Follow-on after merge (needs Jon's OK): require `review-gate` on `main`, with its source pinned to **GitHub Actions** (the app that posts the status), not "any source".
- **Api `main` has no branch protection today**, so the follow-on here means *creating* protection on `main` (not just adding a context), with `review-gate` (and the CI checks) required.

## Linking PRs to tickets (HARD)

- Every PR for a ticket links it with a **closing keyword** so it shows under the issue's **Development** panel: same repo `Closes #N`; another repo `Closes cultpodcasts/<repo>#N` (e.g. Api / website companions of an RPP ticket: `Closes cultpodcasts/RedditPodcastPoster#N`). Do **not** use `Refs` for the ticket a PR delivers — `Refs` PRs are invisible under Development.
- A ticket with PRs in several repos stays **open until ALL of its PRs are merged**. GitHub closes it on the first `Closes` merge; `.github/workflows/issue-close-sibling-guard.yml` (mirrored in RedditPodcastPoster, Api and website) reopens it while any PR for it is still open (Development links, cross-references incl. `Refs`, trio search) and restores the board card to In Progress (cultpodcasts/RedditPodcastPoster#1423).
- List companion PRs in the PR body (`Companions: cultpodcasts/Api#…, cultpodcasts/website#…`) with the merge order.

## Cursor Cloud specific instructions <!-- pragma: allowlist secret -->

Multi-repo workspace: this repo is at `/agent/repos/api` alongside `/agent/repos/website` and <!-- pragma: allowlist secret -->
`/agent/repos/redditpodcastposter`. The startup update script runs `npm ci` + `./build.sh` <!-- pragma: allowlist secret -->
(`prisma generate`) here. <!-- pragma: allowlist secret -->

- **HARD**: Never use the `pin-github-identity` skill (or `GH_TOKEN` process-override from `gh auth token --user …`) on Cursor Cloud / Cloud Agent VMs; GitHub identity is whatever Cursor assigned to the run. <!-- pragma: allowlist secret -->
- **Node**: the app needs Node 22.22.3 (installed via nvm). Login shells (`bash -lc`, tmux) get it <!-- pragma: allowlist secret -->
  from `~/.bashrc`. The sandbox ships an older `/exec-daemon/node` (22.14.0) that shadows PATH in <!-- pragma: allowlist secret -->
  bare non-login shells — prefer `bash -lc "…"` or prepend `$HOME/.nvm/versions/node/v22.22.3/bin`. <!-- pragma: allowlist secret -->
- **Local dev**: `npm run start` serves the Worker at `https://127.0.0.1:8787` and requires <!-- pragma: allowlist secret -->
  `.cert/dev-cert.pem` + `.cert/dev-key.pem` (self-signed, gitignored, persisted in the snapshot). <!-- pragma: allowlist secret -->
  If missing, regenerate a SAN cert for `local.cultpodcasts.com`, `localhost`, `127.0.0.1`. A hosts <!-- pragma: allowlist secret -->
  entry `127.0.0.1 local.cultpodcasts.com` is set so the website can reach the worker by hostname. <!-- pragma: allowlist secret -->
- **Local bindings/data**: D1/KV/R2/DO/Analytics all run under Miniflare (`--env local`), but the <!-- pragma: allowlist secret -->
  buckets are empty. Self-contained endpoints work offline: `GET /og-image?u=<img>&a=wide&t=<title>&pl=spotify,apple` <!-- pragma: allowlist secret -->
  returns a composed 1200×630 PNG; `GET /docs` (302→Swagger). `/homepage`, `/subjects`, `/search` <!-- pragma: allowlist secret -->
  etc. need seeded R2 or the Azure Functions backend + secrets. To demo homepage content locally, <!-- pragma: allowlist secret -->
  seed the R2 `content/homepage` object: `npx wrangler r2 object put content/homepage --file=<json> --local` <!-- pragma: allowlist secret -->
  (shape: `{ recentEpisodes: HomepageEpisode[], episodeCount, totalDuration }`). <!-- pragma: allowlist secret -->
- Never deploy (see the No-deploys rule); local `wrangler dev` only. <!-- pragma: allowlist secret -->
