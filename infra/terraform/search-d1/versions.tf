terraform {
  # 1.10+ for S3-native state locking (use_lockfile) and import blocks with for_each.
  required_version = ">= 1.10.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }

  # Remote state in Cloudflare R2 (S3-compatible). The bucket is created by hand once
  # (see ../README.md). Credentials come from AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
  # (an R2 API token's S3 access key pair), never from this file.
  # R2 supports conditional PutObject (If-None-Match), so use_lockfile gives real locking;
  # the CI workflow also serialises runs with a concurrency group.
  backend "s3" {
    bucket = "cultpodcasts-terraform-state"
    key    = "api/search-d1/terraform.tfstate"
    region = "auto"
    endpoints = {
      s3 = "https://bae3f835f19899c6eee1ec48f2d658cf.r2.cloudflarestorage.com"
    }
    use_lockfile                = true
    use_path_style              = true
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true
  }
}
