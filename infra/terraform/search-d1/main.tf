# Search platform D1 databases (SP-1.10, cultpodcasts/Api#270; epic RedditPodcastPoster#1312).
#
# Deletion protection (Jon, 16 Nov 2026: "we cannot accidentally delete it"):
#   1. lifecycle.prevent_destroy on both databases: Terraform refuses any plan that destroys
#      or replaces them while these blocks exist.
#   2. CI plan guard (scripts/plan-guard.mjs): fails on any delete or replace of a
#      cloudflare_d1_database, including the case prevent_destroy cannot catch, where the
#      resource block itself has been removed from the config.
#   3. Apply only runs behind the GitHub environment approval; no workflow runs destroy.
#
# The schema is not managed here: CI applies workers/search/migrations with wrangler after
# apply (preview first). Azure stays on bicep; nothing here touches it.

resource "cloudflare_d1_database" "search" {
  account_id            = var.cloudflare_account_id
  name                  = "cultpodcasts-search"
  primary_location_hint = var.primary_location_hint

  read_replication = {
    mode = var.read_replication_mode
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_d1_database" "search_preview" {
  account_id            = var.cloudflare_account_id
  name                  = "cultpodcasts-search-preview"
  primary_location_hint = var.primary_location_hint

  read_replication = {
    mode = var.read_replication_mode
  }

  lifecycle {
    prevent_destroy = true
  }
}
