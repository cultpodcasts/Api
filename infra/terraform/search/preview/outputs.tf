# For the CI deploy config and id sync (scripts/check-wrangler-ids.sh, scripts/sync-wrangler-ids.mjs).
# D1 database ids are not secrets.

output "database_name" {
  value = module.search.database_name
}

output "database_id" {
  value = module.search.database_id
}

output "worker_name" {
  value = module.search.worker_name
}

# So the account id lives only in variables.tf.
output "account_id" {
  value = var.cloudflare_account_id
}
