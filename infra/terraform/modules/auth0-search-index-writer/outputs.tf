output "permission" {
  description = "The permission POST /search/admin/docs requires."
  value       = auth0_resource_server_scope.write_search_index.scope
}

output "role_id" {
  value = auth0_role.search_indexer.id
}

output "client_id" {
  description = "Client id of the search-index writer's M2M app (not a secret)."
  value       = auth0_client.search_index_writer.client_id
}

output "client_secret" {
  description = "The writer's client secret. Sensitive: never printed by CI; read only by its delivery to the caller."
  value       = auth0_client_credentials.search_index_writer.client_secret
  sensitive   = true
}

output "api_identifier" {
  value = var.api_identifier
}
