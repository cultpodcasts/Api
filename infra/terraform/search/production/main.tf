# Search stack, production (SP-1.11, cultpodcasts/Api#273). See ../../modules/search-stack and
# ../../README.md. Names must match wrangler.search.jsonc (checked by tests).

module "search" {
  source = "../../modules/search-stack"

  account_id    = var.cloudflare_account_id
  database_name = "cultpodcasts-search"
  worker_name   = "search"
}
