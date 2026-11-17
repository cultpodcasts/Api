variable "api_identifier" {
  description = "Identifier (audience) of the EXISTING Auth0 API the Api Worker verifies tokens for (its auth0Audience). Terraform adds a permission to it; it does not own the API."
  type        = string

  validation {
    condition     = can(regex("^https://", var.api_identifier))
    error_message = "api_identifier must be the API's https:// identifier, e.g. https://api.cultpodcasts.com/."
  }
}

variable "client_name" {
  description = "Name of the search-index writer's M2M application in this tenant."
  type        = string
  default     = "search-index-writer"
}
