output "permission" {
  value = module.search_index_writer.permission
}

output "api_identifier" {
  value = module.search_index_writer.api_identifier
}

output "role_id" {
  value = module.search_index_writer.role_id
}

# Not a secret: the writer's client id, for its caller's configuration.
output "client_id" {
  value = module.search_index_writer.client_id
}

# Sensitive (masked in plan/apply/output). Only for delivering the secret to the writer; see
# infra/terraform/README.md, "Where the writer's credentials go".
output "client_secret" {
  value     = module.search_index_writer.client_secret
  sensitive = true
}
