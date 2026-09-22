<#
.SYNOPSIS
  Delete streaming-scrape-us-preview so it is not left running between surveys.

.DESCRIPTION
  Preview Api Builds that bind SCRAPE_US will fail while this Worker is missing —
  re-deploy with ensure-scrape-us-preview.ps1 (or run-survey.ps1) before the next
  api-preview publish that needs the binding.
#>
$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "../..")
$wranglerJs = Join-Path $repoRoot "node_modules/wrangler/bin/wrangler.js"
Push-Location $repoRoot
try {
	Write-Host "Deleting streaming-scrape-us-preview ..." -ForegroundColor Yellow
	if (Test-Path $wranglerJs) {
		node $wranglerJs delete -c ./wrangler.streaming-scrape-us.jsonc --env preview --force
	} else {
		npx wrangler delete -c ./wrangler.streaming-scrape-us.jsonc --env preview --force
	}
} finally {
	Pop-Location
}
