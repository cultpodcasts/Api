<#
.SYNOPSIS
  Compare survey recommend / assumed techniques to streaming-submit-contract.json.

.DESCRIPTION
  Exit 0 when contract matches survey recommendations.
  Exit 1 when drift is found (or survey summary missing).
  Exit 2 when survey was contaminated / incomplete.

  Technique mapping (survey recommend → contract expectation):
    azurePrepare     → not US scrapeProfiles; not defaultBrowserRenderingServices
    scrapeUsFetch    → scrapeProfiles[key] = { mode: directHttp, region: us }; not BR-for-geo
    cfDirectHttp     → default region directHttp (no US profile; not BR)
    browserRendering → key in defaultBrowserRenderingServices; region default (not us)
    blocked          → always a problem until fixed
#>
param(
	[string] $SurveySummary = "",
	[string] $ContractJson = "",
	[string] $Service = ""
)

$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
$repoRoot = Resolve-Path (Join-Path $here "../..")
if (-not $SurveySummary) { $SurveySummary = Join-Path $here "out/survey-summary.json" }
if (-not $ContractJson) { $ContractJson = Join-Path $repoRoot "tests/fixtures/streaming-submit-contract.json" }

if (-not (Test-Path $SurveySummary)) {
	Write-Host "Missing survey summary: $SurveySummary — run the survey first." -ForegroundColor Red
	exit 1
}

$survey = Get-Content $SurveySummary -Raw | ConvertFrom-Json
if ($survey.contaminated -eq $true) {
	Write-Host "Survey contaminated — do not compare." -ForegroundColor Red
	exit 2
}

$contract = Get-Content $ContractJson -Raw | ConvertFrom-Json
$brList = @($contract.defaultBrowserRenderingServices)
$profiles = $contract.scrapeProfiles

function Get-ContractTechnique([string] $svc) {
	$prof = $null
	if ($profiles.PSObject.Properties.Name -contains $svc) {
		$prof = $profiles.$svc
	}
	$inBr = $brList -contains $svc
	if ($prof -and $prof.region -eq "us") {
		return "scrapeUsFetch"
	}
	if ($inBr -or ($prof -and $prof.mode -eq "browserRendering")) {
		return "browserRendering"
	}
	if ($prof -and $prof.mode -eq "directHttp" -and ($null -eq $prof.region -or $prof.region -eq "default")) {
		return "cfDirectHttp"
	}
	return "azurePrepare"
}

$rows = @($survey.rows)
if ($Service) {
	$rows = @($rows | Where-Object { $_.service -eq $Service })
}
if ($rows.Count -eq 0) {
	Write-Host "No survey rows to compare." -ForegroundColor Red
	exit 1
}

$problems = [System.Collections.Generic.List[string]]::new()
$ok = [System.Collections.Generic.List[string]]::new()

foreach ($r in $rows) {
	$svc = [string]$r.service
	$rec = [string]$r.recommend
	$assumed = if ($null -eq $r.assumed) { "" } else { [string]$r.assumed }
	$contractTech = Get-ContractTechnique $svc

	if ($rec -eq "blocked" -or $rec -eq "unknown-run-with-azure") {
		[void]$problems.Add("$svc`: survey recommend=$rec (fix prepare path or specimen URL)")
		continue
	}

	if ($assumed -and $assumed -ne $rec) {
		[void]$problems.Add("$svc`: assumedTechnique=$assumed but survey recommend=$rec (update survey-urls.json assumedTechnique)")
	}

	if ($contractTech -ne $rec) {
		[void]$problems.Add("$svc`: contract implies $contractTech but survey recommend=$rec — update scrapeProfiles / defaultBrowserRenderingServices (or re-check specimens)")
	} else {
		[void]$ok.Add("$svc`: recommend=$rec matches contract")
	}

	# Hard safety: never encode geo as BR
	if ($rec -eq "scrapeUsFetch" -and ($brList -contains $svc)) {
		[void]$problems.Add("$svc`: recommend scrapeUsFetch but also in defaultBrowserRenderingServices — BR is not a geo tool")
	}
	if ($rec -eq "browserRendering") {
		$prof = $null
		if ($profiles.PSObject.Properties.Name -contains $svc) { $prof = $profiles.$svc }
		if ($prof -and $prof.region -eq "us") {
			[void]$problems.Add("$svc`: recommend browserRendering but scrapeProfiles.region=us — conflict")
		}
	}
}

Write-Host "`n=== SURVEY vs CONTRACT ===" -ForegroundColor Cyan
foreach ($line in $ok) { Write-Host "OK  $line" -ForegroundColor Green }
foreach ($line in $problems) { Write-Host "!!  $line" -ForegroundColor Red }

$driftPath = Join-Path $here "out/survey-contract-drift.md"
$md = @(
	"# Survey vs contract drift",
	"",
	"Generated from ``$(Split-Path $SurveySummary -Leaf)`` vs ``streaming-submit-contract.json``.",
	"",
	"## Matches",
	""
) + @($ok | ForEach-Object { "- $_" }) + @("", "## Problems", "") + @(
	if ($problems.Count -eq 0) { "- (none)" } else { $problems | ForEach-Object { "- $_" } }
) + @("")
($md -join "`n") | Set-Content $driftPath -Encoding utf8
Write-Host "Wrote $driftPath"

if ($problems.Count -gt 0) {
	exit 1
}
Write-Host "`nNo drift." -ForegroundColor Green
exit 0
