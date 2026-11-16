terraform {
  # 1.7+ for removed blocks and import blocks. CI pins 1.14.8, as in cultpodcasts/freedomtimes.
  required_version = ">= 1.7.0"

  # State in HCP Terraform, in CultPodcasts' own organisation `cultpodcasts` (Jon, 16 Nov 2026:
  # "it should not be in the freedom times account!"). One workspace per environment, so a PR's
  # preview apply can never touch production state. The workspace must use Execution Mode:
  # Local: plan and apply run on the GitHub runner (credentials from GitHub secrets as TF_VAR_*),
  # HCP only stores and locks state, and the runner keeps the saved plan the plan guard reads.
  # Auth: TF_TOKEN_app_terraform_io (GitHub secret TF_TOKEN_APP_TERRAFORM_IO).
  cloud {
    organization = "cultpodcasts"

    workspaces {
      name = "cultpodcasts-api-search-d1-preview"
    }
  }

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.22"
    }
  }
}
