terraform {
  # 1.7+ for import blocks with for_each. CI pins 1.14.8, as in cultpodcasts/freedomtimes.
  required_version = ">= 1.7.0"

  # State in HCP Terraform, in CultPodcasts' own organisation `cultpodcasts` (Jon, 16 Nov 2026:
  # separate from freedomtimes' organisation), following the cultpodcasts/freedomtimes
  # conventions (infra/terraform/environments/*/versions.tf). The workspace must use Execution Mode:
  # Local: the plan runs on the GitHub runner (credentials from GitHub secrets as TF_VAR_*),
  # HCP only stores and locks state. That keeps a local saved plan for
  # `terraform show -json`, which the plan guard reads before every apply.
  # Auth: TF_TOKEN_app_terraform_io (GitHub secret TF_TOKEN_APP_TERRAFORM_IO).
  cloud {
    organization = "cultpodcasts"

    workspaces {
      name = "cultpodcasts-api-search-d1"
    }
  }

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.22"
    }
  }
}
