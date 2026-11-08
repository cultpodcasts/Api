# Azure ↔ D1 search parity harness

Runs identical `/docs/search` POST bodies against the **production Azure AI
Search index** (read-only) and the **deployed D1 lookalike** endpoint
(`search-demo` Worker), measures agreement, and explains every difference.

## What it tests

- `cases.mjs / odataUseCases` — every `/search` body shape the Angular app
  constructs, captured from website source: free-text search page (facets,
  sort), subject page (facet probe, narrowed results, search-within-subject),
  podcast page (browse + search-within-podcast), series hubs, moved-kind probe,
  episode lookup (`id eq`), related rails (`id ne`, subject rail).
- `freeTextQueries` — what most users actually type (no syntax), chosen to also
  probe tokenizer edges: apostrophes (`heaven's gate`), hyphens
  (`multi-level marketing`), initials (`l. ron hubbard`), possessives.
- `syntaxQueries` — the power-user minority: phrases, `+`, `*`, `-`.

## What it reports (report.md / report.json)

- counts on both sides; **full id-set containment** both directions
- every Azure hit missing from D1 classified: `not_in_corpus` (doc newer than
  the corpus snapshot — not a parity bug) / `tokenization` (text is present,
  FTS5 missed it) / `unexplained` (investigate)
- every D1 extra classified: `description_truncation` (beyond Azure's ~100-char
  index cap) / `guests_field` (not indexed in Azure at all) / `search_terms` /
  `other_field`
- top-10 rank overlap (ranking parity is a separate, later tuning task)
- facet bucket agreement (top-5 value:count exact compare)

Cases where either side has more than 10,000 ids are marked `capped` and
compared on counts/top-10 only — per-id diffing of different pagination
windows would mis-classify paging as tokenization.

## Measured result (2026-11-07, porter FTS + en.lucene query mirroring)

With the FTS index on `tokenize='porter unicode61'` and the query translator
mirroring `en.lucene` (stopword drop, hyphen/slash splitting, possessive
OR-expansion), Azure⊆D1 containment is 99.99% across the free-text corpus
(8 missing of 88,080 Azure hits). The single remaining flagged case
(`l. ron hubbard`) is an **Azure artefact**: its ~100-char description
truncation cuts words mid-URL, minting spurious single-letter `l` tokens
(`vicnews.com/l…`) that D1's full-text field correctly does not have.

## Running

Requires (env names only — never committed):
`RedditPodcastPoster_searchIndex__Url` / `__Key` / `__IndexName` (Azure,
read-only), `CLOUDFLARE_D1_DEPLOY_TOKEN` (raw-SQL explanations), and
`SEARCH_API_KEY` (read from `../.dev.vars` when not in env).
Optional: `SEARCH_DEMO_URL` (defaults to the workers.dev route — the custom
domain rejects non-browser POSTs via the zone bot challenge).

```sh
node search-demo/harness/run.mjs            # full run
node search-demo/harness/run.mjs --free-text-only
node search-demo/harness/run.mjs --out /tmp/report.md
```

`report.md` / `report.json` are gitignored outputs.
