# Api

The API is the endpoint queries by the Website project.

It is currently hosted as a Cloudflare Worker and D1 Database.

## Build steps
-- Export to sql-lite:
	Sqllite3DatabasePublisher.exe
Convert to SQL statements:
	sqlite3 podcasts.sqlite .dump  > podcasts.sql
Migrate database back to initial state:
	node_modules\.bin\wrangler d1 time-travel restore cultpodcasts --bookmark XXXXXX
Upload Data:
	node_modules\.bin\wrangler d1 execute cultpodcasts --file=./podcasts.sql
Enable full-text-search
	node_modules\.bin\wrangler d1 migrations apply cultpodcasts
