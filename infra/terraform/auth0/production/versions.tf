terraform {
  # Same pin and floor as the search stack (CI runs 1.14.8).
  required_version = ">= 1.7.0"

  # State in HCP Terraform org `cultpodcasts` (never freedomtimes, never R2), its own workspace
  # per tenant so a PR's staging apply can never touch production state. Execution Mode: Local
  # (plan and apply run on the runner; the plan guard reads the saved plan). Created once by Jon
  # (infra/terraform/README.md, Auth0 bootstrap). Auth: TF_TOKEN_app_terraform_io.
  cloud {
    organization = "cultpodcasts"

    workspaces {
      name = "cultpodcasts-auth0"
    }
  }

  required_providers {
    auth0 = {
      source  = "auth0/auth0"
      version = "~> 1.60"
    }
  }
}
