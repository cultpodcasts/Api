variable "auth0_domain" {
  description = "Canonical Auth0 tenant domain for the Management API (TF_AUTH0_DOMAIN), e.g. <tenant>.<region>.auth0.com. Not the custom login domain."
  type        = string
}

variable "auth0_client_id" {
  description = "Client id of the Terraform management M2M app (TF_AUTH0_CLIENT_ID)."
  type        = string
  sensitive   = true
}

variable "auth0_client_secret" {
  description = "Client secret of the Terraform management M2M app (TF_AUTH0_CLIENT_SECRET)."
  type        = string
  sensitive   = true
}

variable "api_identifier" {
  description = "Identifier of this tenant's existing Api (the api Worker's auth0Audience). Override with TF_VAR_api_identifier."
  type        = string
  default     = "https://api.cultpodcasts.com/"
}
