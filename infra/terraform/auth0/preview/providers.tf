# Auth0 Management API credentials of the Terraform M2M app Jon created in the STAGING tenant (custom login domain auth-staging.cultpodcasts.com).
# CI sets TF_VAR_auth0_* from the cloudflare-preview environment secrets TF_AUTH0_DOMAIN /
# TF_AUTH0_CLIENT_ID / TF_AUTH0_CLIENT_SECRET. Never written to a file.
provider "auth0" {
  domain        = var.auth0_domain
  client_id     = var.auth0_client_id
  client_secret = var.auth0_client_secret
}
