-- Migration number: 0003 	 2026-11-22
-- RPP #1411: retrievable, non-searchable additional YouTube uploads on a search document.
-- Same shape as `trailers`: a JSON array of tokens (`{youTubeId}|{release}|{channelName}`).
-- Not in FTS (the field is not searchable), so this is an ALTER only — no shadow rebuild.

ALTER TABLE search_docs ADD COLUMN youtube_alternates TEXT;

UPDATE search_meta SET value = '3' WHERE key = 'schema_version';
