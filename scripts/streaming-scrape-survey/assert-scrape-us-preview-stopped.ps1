<#
.SYNOPSIS
  Confirm streaming-scrape-us-preview does not exist (stopped / deleted).

.DESCRIPTION
  Exit 0 if the Worker is absent. Exit 1 if it still exists or status is unknown.
  Prints a one-line status for agents/ops to quote when starting or finishing a survey.

.PARAMETER Phase
  start — report leftover Worker as previous-run teardown failure
  end   — report whether this run left the Worker stopped (default)
#>
param(
	[ValidateSet("start", "end")]
	[string] $Phase = "end"
)

$ErrorActionPreference = "Continue"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "../..")
$wranglerJs = Join-Path $repoRoot "node_modules/wrangler/bin/wrangler.js"
if (-not (Test-Path $wranglerJs)) {
	Write-Host "SURVEY_WORKERS: UNKNOWN (wrangler not found under node_modules)" -ForegroundColor Yellow
	exit 1
}

Push-Location $repoRoot
try {
	$out = & node $wranglerJs deployments list -c ./wrangler.streaming-scrape-us.jsonc --env preview 2>&1 | Out-String
	$code = $LASTEXITCODE
	$combined = $out

	$absent = $combined -match 'does not exist|code:\s*10007|Worker not found'
	$present = $code -eq 0 -and $combined -match 'Deployment|Created:|Version'

	if ($Phase -eq "start") {
		if ($absent) {
			Write-Host "SURVEY_WORKERS_START: CLEAN (streaming-scrape-us-preview already stopped)" -ForegroundColor Green
			exit 0
		}
		if ($present) {
			Write-Host "SURVEY_WORKERS_START: NOT_STOPPED — previous survey likely failed to tear down streaming-scrape-us-preview" -ForegroundColor Red
			exit 1
		}
		Write-Host "SURVEY_WORKERS_START: UNKNOWN (could not verify streaming-scrape-us-preview)" -ForegroundColor Yellow
		Write-Host $combined
		exit 1
	}

	if ($absent) {
		Write-Host "SURVEY_WORKERS: STOPPED (streaming-scrape-us-preview absent)" -ForegroundColor Green
		exit 0
	}
	if ($present) {
		Write-Host "SURVEY_WORKERS: STILL_RUNNING (streaming-scrape-us-preview present)" -ForegroundColor Red
		Write-Host $combined
		exit 1
	}
	Write-Host "SURVEY_WORKERS: UNKNOWN (could not verify streaming-scrape-us-preview)" -ForegroundColor Yellow
	Write-Host $combined
	exit 1
} finally {
	Pop-Location
}
