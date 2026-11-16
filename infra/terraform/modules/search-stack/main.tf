# One search stack (SP-1.11, cultpodcasts/Api#273; epic RedditPodcastPoster#1312): the search
# D1 database plus the EMPTY Worker shell its code is deployed into. Used once per environment
# root (../../search/production, ../../search/preview), each with its own HCP workspace.
#
# Terraform is infra and always runs first; CI then applies the D1 migrations and deploys the
# code with wrangler (`npm run deploy:search` / `deploy:search:preview`) in the same job, only
# after a successful apply. Code stays out of Terraform.
#
# Deletion protection (Jon, 16 Nov 2026: "we cannot accidentally delete it"):
#   1. lifecycle.prevent_destroy on the database and the Worker shell.
#   2. CI plan guard (scripts/plan-guard.mjs): fails on any delete or replace of either type,
#      including when a resource block is removed from the config (prevent_destroy cannot see that).
#   3. Production apply only runs behind the cloudflare-production approval; no workflow runs destroy.

resource "cloudflare_d1_database" "this" {
  account_id            = var.account_id
  name                  = var.database_name
  primary_location_hint = var.primary_location_hint

  read_replication = {
    mode = var.read_replication_mode
  }

  lifecycle {
    prevent_destroy = true
    # The API does not return the location hint, so an imported database (preview, adopted from
    # the old single workspace) would otherwise plan a forced REPLACE to "set" it. A D1 database
    # cannot move region anyway; the hint only matters at creation.
    ignore_changes = [primary_location_hint]
  }
}

# Worker shell only: name, account and no public hostname. wrangler owns the script, bindings,
# vars, observability and compatibility settings (wrangler.search.jsonc), so Terraform ignores
# the settings wrangler writes on every deploy instead of fighting it.
resource "cloudflare_worker" "this" {
  account_id = var.account_id
  name       = var.worker_name

  # Service-binding only (SP-1.3): no workers.dev URL and no preview URLs, same as
  # workers_dev / preview_urls = false in wrangler.search.jsonc, so the shell is never public.
  subdomain = {
    enabled          = false
    previews_enabled = false
  }

  lifecycle {
    prevent_destroy = true
    ignore_changes  = [observability, logpush, tags, tail_consumers, previews_base_config]
  }
}
