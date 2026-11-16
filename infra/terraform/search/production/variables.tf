variable "cloudflare_api_token" {
  description = "Cloudflare API token (TF_VAR_cloudflare_api_token): D1 + Workers Scripts Read for plan, Edit for apply."
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare account that owns the search stack (same account as wrangler.search.jsonc). Override with TF_VAR_cloudflare_account_id."
  type        = string
  default     = "bae3f835f19899c6eee1ec48f2d658cf"
}
