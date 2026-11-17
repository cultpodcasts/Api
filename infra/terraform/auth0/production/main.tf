# Auth0 search-index write access, PRODUCTION tenant (custom login domain auth.cultpodcasts.com), applied from main after Jon's approval (cultpodcasts/Api#284).
# See ../../modules/auth0-search-index-writer and ../../README.md.

module "search_index_writer" {
  source = "../../modules/auth0-search-index-writer"

  api_identifier = var.api_identifier
}
