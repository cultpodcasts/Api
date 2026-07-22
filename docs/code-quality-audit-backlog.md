# Code quality audit — ranked backlog

Canonical cross-project backlog (Phase 2 Top 15 + Wave 1–3 checklists):

[`cultpodcasts/RedditPodcastPoster/docs/code-quality-audit-backlog.md`](../../cultpodcasts/RedditPodcastPoster/docs/code-quality-audit-backlog.md)

## Api secrets (Wave 1 correction)

Plaintext secrets / Azure Function endpoint URLs were removed from tracked `set-secrets-*.ps1` scripts. Values live in gitignored `scripts/local-secrets.*.env` (see [worker-secrets.md](./worker-secrets.md)).
