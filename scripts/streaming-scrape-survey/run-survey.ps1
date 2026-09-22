<#
.SYNOPSIS
  Streaming scrape survey via Api POST /ops/streaming-scrape-survey (PoP-gated).

.DESCRIPTION
  Calls the deployed Api Worker — ephemeral isolates, no permanent probe Workers.
  PoP preflight must pass or the Api returns contaminated=true (409).

  Legs: azure | cfFetch | cfBr (hydration) | cfUsFetch (geo via SCRAPE_US directHttp — never BR).

  When -IncludeUsFetch: deploys streaming-scrape-us-preview, then deletes it in finally
  unless -KeepScrapeWorker. Production streaming-scrape-us is product (not torn down).

.PARAMETER ApiBaseUrl
  Api origin (preview/workers.dev recommended for M2M — Bot Fight on apex).

.PARAMETER SecretsFile
  local-secrets.*.env for secureSubmitEndpoint / auth0Audience / auth0Issuer /
  CULT_AUTH0_M2M_CLIENT_ID / CULT_AUTH0_M2M_CLIENT_SECRET (staging tenant for api-preview).

.PARAMETER IncludeUsFetch
  Include cfUsFetch leg (deploys + tears down streaming-scrape-us-preview).

.PARAMETER KeepScrapeWorker
  Do not delete streaming-scrape-us-preview after the survey.

.PARAMETER SkipContractCompare
  Skip compare-survey-to-contract.ps1 after a successful survey.

.PARAMETER ExpectedEdgeLocs / ExpectedEdgeColos
  Allowlists for cfFetch / cfBr preflight.

.PARAMETER ExpectedUsLocs / ExpectedUsColos
  Allowlists for cfUsFetch preflight (prefer colos, e.g. IAD).
#>
param(
	[Parameter(Mandatory = $true)]
	[string] $ApiBaseUrl,

	[string] $UrlsFile = "",
	[string] $Service = "",
	[switch] $SkipAzure,
	[switch] $SkipCfBr,
	[switch] $IncludeUsFetch,
	[switch] $KeepScrapeWorker,
	[switch] $SkipContractCompare,
	[string] $SecretsFile = "",
	[string] $BearerToken = $env:CULT_API_BEARER,
	[string] $Auth0TokenUrl = $env:CULT_AUTH0_TOKEN_URL,
	[string] $Auth0ClientId = $env:CULT_AUTH0_M2M_CLIENT_ID,
	[string] $Auth0ClientSecret = $env:CULT_AUTH0_M2M_CLIENT_SECRET,
	[string] $Auth0Audience = $env:CULT_AUTH0_AUDIENCE,
	[string[]] $ExpectedEdgeLocs = @(),
	[string[]] $ExpectedEdgeColos = @(),
	# US scrape Worker often reports colo=IAD (or similar) with loc still GB — prefer colos.
	[string[]] $ExpectedUsLocs = @(),
	[string[]] $ExpectedUsColos = @(),
	[int] $TimeoutSec = 300
)

$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
$outDir = Join-Path $here "out"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
if (-not $UrlsFile) { $UrlsFile = Join-Path $here "survey-urls.json" }

$scrapeStarted = $false
$exitCode = 0

function Read-SecretsFile([string] $path) {
	$map = @{}
	if (-not $path -or -not (Test-Path $path)) { return $map }
	Get-Content $path | ForEach-Object {
		$line = $_.Trim()
		if (-not $line -or $line.StartsWith("#")) { return }
		$i = $line.IndexOf("=")
		if ($i -lt 1) { return }
		$map[$line.Substring(0, $i).Trim()] = $line.Substring($i + 1).Trim()
	}
	return $map
}

if ($SecretsFile) {
	$secrets = Read-SecretsFile $SecretsFile
	if (-not $Auth0Audience -and $secrets["auth0Audience"]) { $Auth0Audience = $secrets["auth0Audience"] }
	if (-not $Auth0TokenUrl -and $secrets["auth0Issuer"]) {
		$Auth0TokenUrl = "$($secrets['auth0Issuer'].TrimEnd('/'))/oauth/token"
	}
	if (-not $Auth0ClientId -and $secrets["CULT_AUTH0_M2M_CLIENT_ID"]) {
		$Auth0ClientId = $secrets["CULT_AUTH0_M2M_CLIENT_ID"]
	}
	if (-not $Auth0ClientSecret -and $secrets["CULT_AUTH0_M2M_CLIENT_SECRET"]) {
		$Auth0ClientSecret = $secrets["CULT_AUTH0_M2M_CLIENT_SECRET"]
	}
}

function Get-Auth0M2mToken {
	if ($BearerToken) {
		Write-Host "Using -BearerToken / CULT_API_BEARER (prefer M2M)." -ForegroundColor Yellow
		return $BearerToken
	}
	if (-not $Auth0TokenUrl -or -not $Auth0ClientId -or -not $Auth0ClientSecret -or -not $Auth0Audience) {
		throw "Need CULT_AUTH0_M2M_CLIENT_ID/SECRET + audience/token URL (or -SecretsFile), or CULT_API_BEARER"
	}
	Write-Host "Fetching Auth0 M2M token ..." -ForegroundColor Cyan
	$body = @{
		grant_type = "client_credentials"
		client_id = $Auth0ClientId
		client_secret = $Auth0ClientSecret
		audience = $Auth0Audience
	} | ConvertTo-Json
	$resp = Invoke-RestMethod -Method POST -Uri $Auth0TokenUrl -ContentType "application/json" -Body $body
	if (-not $resp.access_token) { throw "missing access_token" }
	return [string]$resp.access_token
}

try {
	$base = $ApiBaseUrl.TrimEnd("/")
	if ($base -notmatch '^https://') { throw "ApiBaseUrl must be https (deployed Api)" }
	if ($base -match '127\.0\.0\.1|localhost') { throw "Refuse localhost — use deployed Api" }

	# Detect leftover preview scrape Worker from a previous survey that failed to tear down.
	& (Join-Path $here "assert-scrape-us-preview-stopped.ps1") -Phase start
	if ($LASTEXITCODE -eq 1) {
		Write-Host "Continuing survey; will tear down in finally unless -KeepScrapeWorker." -ForegroundColor Yellow
	}

	if ($IncludeUsFetch) {
		& (Join-Path $here "ensure-scrape-us-preview.ps1")
		$scrapeStarted = $true
	}

	$token = Get-Auth0M2mToken
	$catalog = Get-Content $UrlsFile -Raw | ConvertFrom-Json
	$targets = @($catalog.targets | Where-Object {
		$_.enabled -ne $false -and $_.url -and (-not $Service -or $_.service -eq $Service)
	} | ForEach-Object {
		[pscustomobject]@{
			id = $_.id
			service = $_.service
			url = $_.url
			assumedTechnique = $_.assumedTechnique
		}
	})
	if ($targets.Count -eq 0) { throw "No targets" }

	$legs = [System.Collections.Generic.List[string]]::new()
	if (-not $SkipAzure) { [void]$legs.Add("azure") }
	[void]$legs.Add("cfFetch")
	if (-not $SkipCfBr) { [void]$legs.Add("cfBr") }
	if ($IncludeUsFetch) { [void]$legs.Add("cfUsFetch") }

	$expectedPop = @{}
	$edgePop = @{}
	if ($ExpectedEdgeLocs.Count -gt 0) { $edgePop.locs = @($ExpectedEdgeLocs) }
	if ($ExpectedEdgeColos.Count -gt 0) { $edgePop.colos = @($ExpectedEdgeColos) }
	if ($legs -contains "cfFetch") {
		if ($edgePop.Count -eq 0) { throw "Set -ExpectedEdgeLocs and/or -ExpectedEdgeColos for cfFetch PoP preflight" }
		$expectedPop.cfFetch = $edgePop
	}
	if ($legs -contains "cfBr") {
		if ($edgePop.Count -eq 0) { throw "Set -ExpectedEdgeLocs and/or -ExpectedEdgeColos for cfBr PoP preflight" }
		$expectedPop.cfBr = $edgePop
	}
	if ($legs -contains "cfUsFetch") {
		$usPop = @{}
		if ($ExpectedUsLocs.Count -gt 0) { $usPop.locs = @($ExpectedUsLocs) }
		if ($ExpectedUsColos.Count -gt 0) { $usPop.colos = @($ExpectedUsColos) }
		if ($usPop.Count -eq 0) { throw "Set -ExpectedUsLocs and/or -ExpectedUsColos for cfUsFetch" }
		$expectedPop.cfUsFetch = $usPop
	}

	$bodyObj = @{
		targets = @($targets | ForEach-Object {
			$o = @{ id = $_.id; service = $_.service; url = $_.url }
			if ($_.assumedTechnique) { $o.assumedTechnique = $_.assumedTechnique }
			$o
		})
		legs = @($legs)
		expectedPop = $expectedPop
	}
	$bodyJson = $bodyObj | ConvertTo-Json -Depth 8 -Compress

	Write-Host "POST $base/ops/streaming-scrape-survey" -ForegroundColor Cyan
	Write-Host "legs=$($legs -join ',') targets=$($targets.Count)"

	$resp = Invoke-WebRequest `
		-Uri "$base/ops/streaming-scrape-survey" `
		-Method POST `
		-TimeoutSec $TimeoutSec `
		-SkipHttpErrorCheck `
		-Headers @{
			Authorization = "Bearer $token"
			"Content-Type" = "application/json"
			Accept = "application/json"
		} `
		-Body $bodyJson

	Set-Content (Join-Path $outDir "survey-raw.json") -Value $resp.Content -Encoding utf8
	$j = $resp.Content | ConvertFrom-Json

	if ([int]$resp.StatusCode -eq 409 -or $j.contaminated -eq $true) {
		Write-Host "CONTAMINATED — PoP preflight failed; survey aborted." -ForegroundColor Red
		Write-Host $resp.Content
		$exitCode = 2
	} elseif ([int]$resp.StatusCode -ne 200) {
		Write-Host "HTTP $($resp.StatusCode)" -ForegroundColor Red
		Write-Host $resp.Content
		$exitCode = 1
	} else {
		$md = @("| service | azure | cfFetch | cfBr | cfUsFetch | recommend | assumed |", "|---------|:-----:|:------:|:----:|:--------:|-----------|---------|")
		foreach ($r in @($j.rows)) {
			$az = if ($null -eq $r.azure) { "—" } elseif ($r.azure) { "✓" } else { "✗" }
			$ff = if ($null -eq $r.cfFetch) { "—" } elseif ($r.cfFetch) { "✓" } else { "✗" }
			$br = if ($null -eq $r.cfBr) { "—" } elseif ($r.cfBr) { "✓" } else { "✗" }
			$uf = if ($null -eq $r.cfUsFetch) { "—" } elseif ($r.cfUsFetch) { "✓" } else { "✗" }
			$md += "| $($r.service) | $az | $ff | $br | $uf | $($r.recommend) | $($r.assumed) |"
		}
		($md -join "`n") + "`n" | Set-Content (Join-Path $outDir "survey-summary.md") -Encoding utf8
		($j | ConvertTo-Json -Depth 8) | Set-Content (Join-Path $outDir "survey-summary.json") -Encoding utf8

		Write-Host "`n=== SURVEY OK ===" -ForegroundColor Green
		$j.rows | Select-Object service, azure, cfFetch, cfBr, cfUsFetch, recommend, assumed | Format-Table -AutoSize | Out-Host
		Write-Host "Wrote out/survey-summary.md"

		if (-not $SkipContractCompare) {
			$compareArgs = @{ SurveySummary = (Join-Path $outDir "survey-summary.json") }
			if ($Service) { $compareArgs.Service = $Service }
			& (Join-Path $here "compare-survey-to-contract.ps1") @compareArgs
			if ($LASTEXITCODE -ne 0) { $exitCode = $LASTEXITCODE }
		}
	}
} catch {
	Write-Host $_.Exception.Message -ForegroundColor Red
	$exitCode = 1
} finally {
	if ($scrapeStarted -and -not $KeepScrapeWorker) {
		try {
			& (Join-Path $here "teardown-scrape-us-preview.ps1")
		} catch {
			Write-Host "WARN: scrape teardown failed: $($_.Exception.Message)" -ForegroundColor Yellow
		}
	} elseif ($scrapeStarted -and $KeepScrapeWorker) {
		Write-Host "Keeping streaming-scrape-us-preview (-KeepScrapeWorker)." -ForegroundColor Yellow
	}

	# Always report whether the survey preview Worker is gone (even if IncludeUsFetch was false).
	& (Join-Path $here "assert-scrape-us-preview-stopped.ps1")
	$stoppedExit = $LASTEXITCODE
	if ($KeepScrapeWorker) {
		if ($stoppedExit -eq 0) {
			Write-Host "NOTE: -KeepScrapeWorker set but Worker is absent." -ForegroundColor Yellow
		} else {
			Write-Host "SURVEY_WORKERS: KEPT_RUNNING (-KeepScrapeWorker) — tear down with npm run survey:scrape-us:teardown when done." -ForegroundColor Yellow
		}
	} elseif ($stoppedExit -ne 0) {
		Write-Host "FAIL: streaming-scrape-us-preview still running after survey — run: npm run survey:scrape-us:teardown" -ForegroundColor Red
		if ($exitCode -eq 0) { $exitCode = 1 }
	}
}

exit $exitCode
