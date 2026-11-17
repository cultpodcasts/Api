# Auth0 write access to the D1 search index (cultpodcasts/Api#284), for POST /search/admin/docs
# (Api#281, src/searchAdminDocs.ts). One tenant per root: see ../../auth0 and ../../README.md.
#
# The API itself is NOT managed here. It is referenced by identifier (var.api_identifier) so that
# Terraform never owns, rewrites or could delete the API every login and token in the tenant
# depends on; auth0_resource_server_scope adds one permission and leaves the API's other
# permissions and settings alone. The Worker checks only the token's
# `write:search-index` permission and that the token is client_credentials; it never reads roles.
#
# Everything is prevent_destroy, and the CI plan guard (scripts/plan-guard.mjs --stack=auth0)
# also refuses deletes and replaces, because prevent_destroy cannot help once a block is removed.
# Replacing the client would issue a NEW client id and secret and break the writer.

locals {
  permission = "write:search-index"
}

resource "auth0_resource_server_scope" "write_search_index" {
  resource_server_identifier = var.api_identifier
  scope                      = local.permission
  description                = "Write the D1 search index (POST /search/admin/docs)"

  lifecycle {
    prevent_destroy = true
  }
}

# Jon, 17 Nov 2026: "new role + permission". The role is the named grouping for the permission in
# the dashboard. It is deliberately assigned to nobody: Auth0 puts a permission into an M2M token
# through the client grant below, not through roles, and the route refuses non-M2M tokens anyway.
resource "auth0_role" "search_indexer" {
  name        = "Search Indexer"
  description = "Holds write:search-index (write the D1 search index). Managed by Terraform (cultpodcasts/Api infra/terraform/auth0). Not for people: the route accepts M2M tokens only."

  lifecycle {
    prevent_destroy = true
  }
}

resource "auth0_role_permission" "search_indexer_write_search_index" {
  role_id                    = auth0_role.search_indexer.id
  resource_server_identifier = var.api_identifier
  permission                 = auth0_resource_server_scope.write_search_index.scope

  lifecycle {
    prevent_destroy = true
  }
}

# Dedicated application: only the search-index writer holds these credentials, so they can be
# rotated or revoked without touching the shared Azure Functions M2M app (Auth0-ClientId).
resource "auth0_client" "search_index_writer" {
  name            = var.client_name
  description     = "Search-index writer (RPP SP-2.1): POST /search/admin/docs, write:search-index only. Terraform: cultpodcasts/Api#284"
  app_type        = "non_interactive"
  grant_types     = ["client_credentials"]
  is_first_party  = true
  oidc_conformant = true

  lifecycle {
    prevent_destroy = true
  }
}

# Auth0 generates the secret. It is held only in this workspace's state (HCP, sensitive), never
# in a variable, file or log. Reading it needs the read:client_keys management scope.
resource "auth0_client_credentials" "search_index_writer" {
  client_id             = auth0_client.search_index_writer.client_id
  authentication_method = "client_secret_post"

  lifecycle {
    prevent_destroy = true
  }
}

# Least privilege: this grant is the ONLY thing that puts a permission in the writer's
# client_credentials tokens, and it names exactly one.
resource "auth0_client_grant" "search_index_writer" {
  client_id    = auth0_client.search_index_writer.client_id
  audience     = var.api_identifier
  subject_type = "client"
  scopes       = [auth0_resource_server_scope.write_search_index.scope]

  lifecycle {
    prevent_destroy = true
  }
}
