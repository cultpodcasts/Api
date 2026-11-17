# Auth0 search-index write access, STAGING tenant (custom login domain auth-staging.cultpodcasts.com), applied on same-repo PRs (cultpodcasts/Api#284).
# See ../../modules/auth0-search-index-writer and ../../README.md.

module "search_index_writer" {
  source = "../../modules/auth0-search-index-writer"

  api_identifier = var.api_identifier
}
