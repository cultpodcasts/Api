<#
.SYNOPSIS
  Deploy streaming-scrape-us-preview (required for cfUsFetch / SCRAPE_US on api-preview).
#>
$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "../..")
Push-Location $repoRoot
try {
	Write-Host "Deploying streaming-scrape-us-preview ..." -ForegroundColor Cyan
	npm run deploy:scrape-us:preview
} finally {
	Pop-Location
}
