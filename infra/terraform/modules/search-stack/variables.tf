variable "account_id" {
  description = "Cloudflare account that owns the search Worker and its D1 database."
  type        = string
}

variable "database_name" {
  description = "D1 database name (cultpodcasts-search or cultpodcasts-search-preview). Must match database_name in wrangler.search.jsonc."
  type        = string
}

variable "worker_name" {
  description = "Worker name (search or search-preview). Must match name in wrangler.search.jsonc."
  type        = string
}

variable "primary_location_hint" {
  description = "D1 primary region. WEUR keeps writes near Azure Functions / Cosmos (search-platform docs). Only used when the database is created."
  type        = string
  default     = "weur"
}

variable "read_replication_mode" {
  description = "D1 global read replication: \"auto\" places replicas in every region; reads only use them through the Sessions API (SP-1.2)."
  type        = string
  default     = "auto"

  validation {
    condition     = contains(["auto", "disabled"], var.read_replication_mode)
    error_message = "read_replication_mode must be \"auto\" or \"disabled\"."
  }
}
