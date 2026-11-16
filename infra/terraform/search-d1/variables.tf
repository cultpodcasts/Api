variable "account_id" {
  description = "Cloudflare account that owns the search databases (same account as wrangler.jsonc)."
  type        = string
  default     = "bae3f835f19899c6eee1ec48f2d658cf"
}

variable "primary_location_hint" {
  description = "D1 primary region. WEUR keeps writes near Azure Functions / Cosmos (search-platform docs)."
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

# Adopt databases that already exist instead of creating new ones. Leave null when the
# database does not exist yet (the normal case). Set to the existing database UUID to make
# the next plan import it; once imported and applied, set it back to null.
variable "import_search_database_id" {
  description = "Existing cultpodcasts-search database UUID to import, or null."
  type        = string
  default     = null
}

variable "import_search_preview_database_id" {
  description = "Existing cultpodcasts-search-preview database UUID to import, or null."
  type        = string
  default     = null
}
