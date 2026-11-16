output "database_name" {
  value = cloudflare_d1_database.this.name
}

output "database_id" {
  value = cloudflare_d1_database.this.id
}

output "worker_name" {
  value = cloudflare_worker.this.name
}
