# Token from TF_VAR_cloudflare_api_token, as in cultpodcasts/freedomtimes. CI sets it from
# TF_PLAN_CLOUDFLARE_API_TOKEN (repo secret, D1 Read + Workers Scripts Read) for plans and from the cloudflare-production
# environment secret TF_APPLY_CLOUDFLARE_API_TOKEN (D1 Edit + Workers Scripts Edit) for apply. Never written to a file.
provider "cloudflare" {
  api_token = var.cloudflare_api_token
}
