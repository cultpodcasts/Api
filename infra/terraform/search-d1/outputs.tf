# Database ids for wrangler.search.jsonc (scripts/sync-wrangler-ids.mjs) and the CI
# migration step. D1 database ids are not secrets.

output "search_database_name" {
  value = cloudflare_d1_database.search.name
}

output "search_database_id" {
  value = cloudflare_d1_database.search.id
}

output "search_preview_database_name" {
  value = cloudflare_d1_database.search_preview.name
}

output "search_preview_database_id" {
  value = cloudflare_d1_database.search_preview.id
}
