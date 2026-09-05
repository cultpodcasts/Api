<#
.SYNOPSIS
  Field-smoke POST /submit/prepare against a remote Api Worker (preview or production).

.DESCRIPTION
  Exercises Cloudflare Browser Rendering + prepare on the live Worker edge — not local
  Puppeteer. Requires a Bearer token with submit or curate, and the target service on
  secret browserRenderingServices when you expect the BR path (e.g. itvx).

  After a BR run, check Workers Logs for:
    br marks=...
    br signals minLength=... ogTitle=... nextData=... jsonLd=...

.PARAMETER BaseUrl
  Api origin. Example: https://api-preview.jonbreen.workers.dev

.PARAMETER Url
  Streaming episode/show URL to prepare (default: sample ITVX episode).

.PARAMETER BearerToken
  Auth0 access token (audience api.cultpodcasts.com). Or set $env:CULT_API_BEARER.

.EXAMPLE
  $env:CULT_API_BEARER = "<token>"
  pwsh ./scripts/submit-prepare-field-smoke.ps1 `
    -BaseUrl https://api-preview.jonbreen.workers.dev

.EXAMPLE
  pwsh ./scripts/submit-prepare-field-smoke.ps1 `
    -BaseUrl https://api-preview.jonbreen.workers.dev `
    -Url "https://www.itv.com/watch/..." `
    -BearerToken $token
#>
param(
	[Parameter(Mandatory = $true)]
	[string] $BaseUrl,

	[string] $Url = "https://www.itv.com/watch/children-of-the-cult/10a5261a0001B/10a5261a0001",

	[string] $BearerToken = $env:CULT_API_BEARER
)

$ErrorActionPreference = "Stop"

if (-not $BearerToken) {
	throw "Pass -BearerToken or set CULT_API_BEARER (Auth0 access token with submit or curate)."
}

$base = $BaseUrl.TrimEnd("/")
$endpoint = "$base/submit/prepare"
$body = @{ url = $Url } | ConvertTo-Json -Compress

Write-Host "POST $endpoint"
Write-Host "url=$Url"

$sw = [System.Diagnostics.Stopwatch]::StartNew()
try {
	$resp = Invoke-WebRequest `
		-Uri $endpoint `
		-Method POST `
		-Headers @{
			Authorization = "Bearer $BearerToken"
			"Content-Type" = "application/json"
			Accept = "application/json"
		} `
		-Body $body
} catch {
	$sw.Stop()
	$r = $_.Exception.Response
	if ($r) {
		$reader = [System.IO.StreamReader]::new($r.GetResponseStream())
		$text = $reader.ReadToEnd()
		Write-Host "HTTP $([int]$r.StatusCode) in $($sw.ElapsedMilliseconds)ms"
		Write-Host $text
		exit 1
	}
	throw
}
$sw.Stop()

Write-Host "HTTP $($resp.StatusCode) in $($sw.ElapsedMilliseconds)ms"
Write-Host $resp.Content
Write-Host ""
Write-Host "Next: Workers Observability / Logs for this CF-Ray — look for br marks / br signals / br_failed."
