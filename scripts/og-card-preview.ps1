<#
.SYNOPSIS
  Fetch sample wide + square OG cards from a running Api Worker and save PNGs.

.DESCRIPTION
  Defaults to local wrangler (https://127.0.0.1:8787). Requires `npm run start`
  in another terminal (or pass -BaseUrl for preview/prod).

.PARAMETER BaseUrl
  Api origin, e.g. https://127.0.0.1:8787 or https://api-preview.jonbreen.workers.dev

.PARAMETER OutDir
  Directory for PNG output (created if missing). Default: .tmp/og-preview

.PARAMETER Open
  Open the saved PNGs after download (Windows default app).

.EXAMPLE
  npm run start   # other terminal
  npm run og:preview

.EXAMPLE
  pwsh ./scripts/og-card-preview.ps1 -BaseUrl https://api-preview.jonbreen.workers.dev -Open
#>
param(
	[string] $BaseUrl = "https://127.0.0.1:8787",
	[string] $OutDir = "",
	[switch] $Open
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $OutDir) {
	$OutDir = Join-Path $repoRoot ".tmp\og-preview"
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$base = $BaseUrl.TrimEnd("/")
$v = "local-" + (Get-Date -Format "HHmmss")

$samples = @(
	@{
		Name = "wide"
		Query = @(
			"u=" + [uri]::EscapeDataString("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg")
			"a=wide"
			"t=" + [uri]::EscapeDataString("Why the fringe keeps winning elections")
			"p=" + [uri]::EscapeDataString("Obscure Politics Weekly")
			"d=" + [uri]::EscapeDataString("1h 24m")
			"r=" + [uri]::EscapeDataString("12/03/2026")
			"pl=youtube,spotify,apple"
			"v=$v"
		) -join "&"
	}
	@{
		Name = "square"
		Query = @(
			"u=" + [uri]::EscapeDataString("https://i.scdn.co/image/ab67616d0000b273c5649add07ed3720be9d5526")
			"a=square"
			"t=" + [uri]::EscapeDataString("Why the fringe keeps winning elections")
			"p=" + [uri]::EscapeDataString("Obscure Politics Weekly")
			"d=" + [uri]::EscapeDataString("1h 24m")
			"r=" + [uri]::EscapeDataString("12/03/2026")
			"pl=spotify,apple,bbc"
			"v=$v"
		) -join "&"
	}
	@{
		Name = "wide-longword"
		Query = @(
			"u=" + [uri]::EscapeDataString("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg")
			"a=wide"
			"t=" + [uri]::EscapeDataString("Supercalifragilisticexpialidocious conspiracy theories explained")
			"p=" + [uri]::EscapeDataString("Obscure Politics Weekly")
			"d=" + [uri]::EscapeDataString("1h 24m")
			"r=" + [uri]::EscapeDataString("12/03/2026")
			"pl=youtube,spotify,apple"
			"v=$v"
		) -join "&"
	}
	@{
		Name = "square-longword"
		Query = @(
			"u=" + [uri]::EscapeDataString("https://i.scdn.co/image/ab67616d0000b273c5649add07ed3720be9d5526")
			"a=square"
			"t=" + [uri]::EscapeDataString("Supercalifragilisticexpialidocious conspiracy theories explained")
			"p=" + [uri]::EscapeDataString("Obscure Politics Weekly")
			"d=" + [uri]::EscapeDataString("1h 24m")
			"r=" + [uri]::EscapeDataString("12/03/2026")
			"pl=spotify,apple,bbc"
			"v=$v"
		) -join "&"
	}
	@{
		Name = "wide-longtitle"
		Query = @(
			"u=" + [uri]::EscapeDataString("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg")
			"a=wide"
			"t=" + [uri]::EscapeDataString("Why the fringe keeps winning elections in every obscure borough across the map this decade and what that means for politics media culture and the rest of us watching from home every single night")
			"p=" + [uri]::EscapeDataString("Obscure Politics Weekly")
			"d=" + [uri]::EscapeDataString("1h 24m")
			"r=" + [uri]::EscapeDataString("12/03/2026")
			"pl=youtube,spotify,apple"
			"v=$v"
		) -join "&"
	}
)

$isLocal = $base -match "127\.0\.0\.1|localhost"
$curlInsecure = @()
if ($isLocal) {
	$curlInsecure = @("-k")
}

foreach ($sample in $samples) {
	$url = "$base/og-image?$($sample.Query)"
	$out = Join-Path $OutDir "og-card-$($sample.Name).png"
	Write-Host "GET $url"
	& curl.exe @curlInsecure -sS --max-redirs 0 -D (Join-Path $OutDir "og-card-$($sample.Name).headers.txt") -o $out $url
	if ($LASTEXITCODE -ne 0) {
		throw "curl failed for $($sample.Name) (is the Worker running? npm run start)"
	}
	$headers = Get-Content (Join-Path $OutDir "og-card-$($sample.Name).headers.txt") -Raw
	if ($headers -notmatch "HTTP/\S+\s+200") {
		Write-Host $headers
		throw "Expected HTTP 200 for $($sample.Name); see headers file. For local TLS use -k (script does)."
	}
	$bytes = [IO.File]::ReadAllBytes($out)
	if ($bytes.Length -lt 8 -or $bytes[0] -ne 0x89 -or $bytes[1] -ne 0x50) {
		throw "Output for $($sample.Name) is not a PNG (len=$($bytes.Length))."
	}
	Write-Host "  -> $out ($($bytes.Length) bytes)"
	if ($Open) {
		Invoke-Item $out
	}
}

Write-Host ""
Write-Host "Design: docs/og-share-image-cards.md"
Write-Host "Saved under $OutDir"
