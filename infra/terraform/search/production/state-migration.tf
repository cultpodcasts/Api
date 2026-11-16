# One-time state split (SP-1.11, cultpodcasts/Api#273). Done by CI; no manual `terraform state`
# commands. Until now this workspace (cultpodcasts-api-search-d1) held BOTH databases at root
# addresses (created by the #270 first apply). Now it holds production only:
#
#   - the production database keeps its identity (f3d9b5b2-7cfd-4194-8a85-e22d36aab42d) and
#     just moves into the shared module;
#   - the preview database (83ae1e81-bf07-4be8-aabf-2d4138959f74) is FORGOTTEN here, never
#     destroyed (destroy = false). The preview workspace adopts it (../preview/adopt.tf).
#
# Both blocks are no-ops once applied and on an empty (rebuilt) state. Remove this file in
# the follow-up once the production apply has run (cultpodcasts/Api#275).

moved {
  from = cloudflare_d1_database.search
  to   = module.search.cloudflare_d1_database.this
}

removed {
  from = cloudflare_d1_database.search_preview

  lifecycle {
    destroy = false
  }
}
