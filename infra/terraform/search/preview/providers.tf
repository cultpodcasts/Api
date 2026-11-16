# Token from TF_VAR_cloudflare_api_token, as in cultpodcasts/freedomtimes. CI sets it from
# the cloudflare-preview environment secret
# TF_PREVIEW_CLOUDFLARE_API_TOKEN (D1 Edit + Workers Scripts Edit) for plan and apply on same-repo PRs. Never written to a file.
provider "cloudflare" {
  api_token = var.cloudflare_api_token
}
