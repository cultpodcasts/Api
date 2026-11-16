# Token from TF_VAR_cloudflare_api_token (GitHub secret TF_VAR_CLOUDFLARE_API_TOKEN), as in
# cultpodcasts/freedomtimes. Never written to a file.
provider "cloudflare" {
  api_token = var.cloudflare_api_token
}
