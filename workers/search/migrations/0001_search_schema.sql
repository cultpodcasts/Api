-- Migration number: 0001 	 2026-11-16
-- Search platform (SP-1.1, cultpodcasts/Api#219): schema for the dedicated search D1
-- databases (binding SEARCH_DB): `cultpodcasts-search` on Worker `search` and
-- `cultpodcasts-search-preview` on Worker `search-preview`. Applied to both by CI (SP-1.10).
--
-- One row per playable document in the unified search index: Episode, TvShowEpisode,
-- Film, NewsReport. Columns mirror RPP `EpisodeSearchRecord` (the Azure AI Search
-- document), plus the G1 additions agreed on 16 Nov 2026: full (uncapped) descriptions,
-- guests, film `alternativeTitles`, and identity ids (RPP #1431, #1437, SP-0.3).
--
-- Ranking (bm25 column weights, exact title/AKA phrase-first) is SP-1.8; the FTS column
-- order below is the contract SP-1.8 weights against. Changing the FTS column list or
-- tokenizer later needs a shadow rebuild (SP-2.3), not an ALTER.

CREATE TABLE search_docs (
	rowid INTEGER PRIMARY KEY,
	-- Azure document key (Cosmos id of the playable).
	id TEXT NOT NULL UNIQUE,
	-- Episode | TvShowEpisode | Film | NewsReport
	kind TEXT NOT NULL,
	title TEXT,
	series_name TEXT,
	-- Full description, never truncated (SP-0.3 option A).
	description TEXT,
	-- Guest names, newline-separated (SP-0.3: searchable from soak day one).
	guests TEXT,
	-- Film AKAs (original, alternative, translated titles), newline-separated.
	alternative_titles TEXT,
	-- Subjects, newline-separated, for full-text matching. Filters and facets use doc_subjects.
	subjects_text TEXT,
	-- Hidden curator terms: searchable, never returned to clients.
	publisher_search_terms TEXT,
	episode_search_terms TEXT,
	-- ISO-8601 UTC with a trailing Z, no milliseconds (Azure shape).
	release TEXT NOT NULL,
	-- .NET TimeSpan string, as Azure stores it.
	duration TEXT NOT NULL,
	-- NULL means English, as in Azure.
	lang TEXT,
	spotify_id TEXT,
	apple_id TEXT,
	podcast_apple_id TEXT,
	youtube_id TEXT,
	bbc TEXT NOT NULL DEFAULT '',
	internet_archive TEXT NOT NULL DEFAULT '',
	svc TEXT NOT NULL DEFAULT '',
	image TEXT,
	-- Film trailers as JSON array of "{duration}|{url}|{title}" tokens; retrievable only.
	trailers TEXT,
	imdb_id TEXT,
	tmdb_id INTEGER,
	tvdb_id INTEGER,
	series_imdb_id TEXT,
	series_tmdb_id INTEGER,
	series_tvdb_id INTEGER,
	-- Source modification time (epoch ms). SP-1.4 drops an upsert older than the stored row.
	modified_at INTEGER NOT NULL DEFAULT 0
);

-- Browse paths (93.7% of traffic): subject / series pages ordered by release, id tie-break (SP-1.7).
CREATE INDEX idx_search_docs_release ON search_docs (release DESC, id);
CREATE INDEX idx_search_docs_series_release ON search_docs (series_name, release DESC, id);
CREATE INDEX idx_search_docs_kind_release ON search_docs (kind, release DESC, id);
CREATE INDEX idx_search_docs_lang ON search_docs (lang);

CREATE TABLE doc_subjects (
	rowid_ref INTEGER NOT NULL REFERENCES search_docs (rowid) ON DELETE CASCADE,
	subject TEXT NOT NULL,
	PRIMARY KEY (rowid_ref, subject)
) WITHOUT ROWID;

CREATE INDEX idx_doc_subjects_subject ON doc_subjects (subject, rowid_ref);

-- External-content FTS5 over search_docs. `porter unicode61` mirrors Azure en.lucene
-- (Porter stemming); unicode61 folds diacritics (intentional superset, see d1-query-engine.md).
-- Column order is a contract: title, alternative_titles, series_name, subjects_text,
-- description, guests, publisher_search_terms, episode_search_terms.
CREATE VIRTUAL TABLE search_fts USING fts5 (
	title,
	alternative_titles,
	series_name,
	subjects_text,
	description,
	guests,
	publisher_search_terms,
	episode_search_terms,
	content = 'search_docs',
	content_rowid = 'rowid',
	tokenize = 'porter unicode61'
);

-- Write contract for these triggers (SP-1.4 writers and any manual fix-up):
--   * Upsert ONLY with `INSERT INTO search_docs (...) VALUES (...) ON CONFLICT(id) DO UPDATE SET ...`.
--     That keeps the rowid and fires search_docs_au, so search_fts stays in step.
--   * NEVER `INSERT OR REPLACE` / `REPLACE INTO` on search_docs. REPLACE deletes the old row
--     WITHOUT firing search_docs_ad unless PRAGMA recursive_triggers is on, so the old terms stay
--     in search_fts (stale hits, a failing content-aware integrity-check) with no warning.
-- Check after bulk work: INSERT INTO search_fts(search_fts, rank) VALUES ('integrity-check', 1);
CREATE TRIGGER search_docs_ai AFTER INSERT ON search_docs BEGIN
	INSERT INTO search_fts (
		rowid, title, alternative_titles, series_name, subjects_text, description, guests,
		publisher_search_terms, episode_search_terms
	) VALUES (
		new.rowid, new.title, new.alternative_titles, new.series_name, new.subjects_text,
		new.description, new.guests, new.publisher_search_terms, new.episode_search_terms
	);
END;

CREATE TRIGGER search_docs_ad AFTER DELETE ON search_docs BEGIN
	INSERT INTO search_fts (
		search_fts, rowid, title, alternative_titles, series_name, subjects_text, description,
		guests, publisher_search_terms, episode_search_terms
	) VALUES (
		'delete', old.rowid, old.title, old.alternative_titles, old.series_name, old.subjects_text,
		old.description, old.guests, old.publisher_search_terms, old.episode_search_terms
	);
END;

-- Only updates that touch an FTS column re-index: modified_at, image, ids and other columns
-- change without rewriting search_fts (fewer billed rows written, less segment churn).
CREATE TRIGGER search_docs_au AFTER UPDATE OF
	title, alternative_titles, series_name, subjects_text, description, guests,
	publisher_search_terms, episode_search_terms
ON search_docs BEGIN
	INSERT INTO search_fts (
		search_fts, rowid, title, alternative_titles, series_name, subjects_text, description,
		guests, publisher_search_terms, episode_search_terms
	) VALUES (
		'delete', old.rowid, old.title, old.alternative_titles, old.series_name, old.subjects_text,
		old.description, old.guests, old.publisher_search_terms, old.episode_search_terms
	);
	INSERT INTO search_fts (
		rowid, title, alternative_titles, series_name, subjects_text, description, guests,
		publisher_search_terms, episode_search_terms
	) VALUES (
		new.rowid, new.title, new.alternative_titles, new.series_name, new.subjects_text,
		new.description, new.guests, new.publisher_search_terms, new.episode_search_terms
	);
END;

-- Key/value metadata: schema version now; rebuild bookkeeping (SP-2.3) later.
CREATE TABLE search_meta (
	key TEXT PRIMARY KEY,
	value TEXT NOT NULL
) WITHOUT ROWID;

INSERT INTO search_meta (key, value) VALUES ('schema_version', '1');
