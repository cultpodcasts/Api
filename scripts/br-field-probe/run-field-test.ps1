<#
.SYNOPSIS
  On-demand Cloudflare Browser Rendering field test across URLs in field-urls.json. Not CI.

.DESCRIPTION
  Spawns the br-field-probe Worker via `wrangler dev` with remote Browser Rendering,
  then GETs the Worker (no ?url=) so it runs every enabled target in field-urls.json.
  Asserts each result is usable catalogue HTML (BR fallback signals).

  Edit field-urls.json to add streaming-provider episode URLs (set enabled=true).

  Requires: wrangler login, account Browser Rendering enabled, network.

.PARAMETER UrlsFile
  Path to JSON catalog (default: ./field-urls.json next to this script).

.PARAMETER Url
  Optional single ad-hoc URL (skips catalog). Use with -Service / -Id for labels.

.PARAMETER Service
  Optional filter: only catalog targets with this service key (e.g. itvx).

.PARAMETER Id
  Optional filter: only catalog target with this id.

.PARAMETER Port
  Local wrangler listen port.

.PARAMETER TimeoutSec
  Max wait for the batch BR HTTP response (scales with target count).

.EXAMPLE
  npm run test:br:field

.EXAMPLE
  pwsh ./scripts/br-field-probe/run-field-test.ps1 -Service itvx
#>
param(
	[string] $UrlsFile = "",
	[string] $Url = "",
	[string] $Service = "",
	[string] $Id = "",
	[int] $Port = 8799,
	[int] $TimeoutSec = 300
)

$ErrorActionPreference = "Stop"
$probeDir = $PSScriptRoot
$outDir = Join-Path $probeDir "out"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

if (-not $UrlsFile) {
	$UrlsFile = Join-Path $probeDir "field-urls.json"
}

$logPath = Join-Path $outDir "field-test-wrangler.log"
$errPath = Join-Path $outDir "field-test-wrangler.err"
$resultPath = Join-Path $outDir "field-test-result.json"

if (Test-Path $logPath) { Remove-Item $logPath -Force -ErrorAction SilentlyContinue }
if (Test-Path $errPath) { Remove-Item $errPath -Force -ErrorAction SilentlyContinue }

$wranglerArgs = @(
	"wrangler", "dev",
	"--port", "$Port",
	"--ip", "127.0.0.1"
)

Write-Host "Starting br field probe (remote Browser Rendering) on 127.0.0.1:$Port ..."
$proc = Start-Process -FilePath "cmd.exe" `
	-ArgumentList (@("/c", "npx") + $wranglerArgs) `
	-WorkingDirectory $probeDir `
	-RedirectStandardOutput $logPath `
	-RedirectStandardError $errPath `
	-PassThru `
	-NoNewWindow

function Stop-Probe {
	if ($proc -and -not $proc.HasExited) {
		Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
		Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
			Where-Object { $_.ParentProcessId -eq $proc.Id } |
			ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
	}
}

try {
	$ready = $false
	$deadline = [DateTime]::UtcNow.AddSeconds(90)
	while ([DateTime]::UtcNow -lt $deadline) {
		if ($proc.HasExited) {
			Get-Content $logPath, $errPath -ErrorAction SilentlyContinue | Select-Object -Last 40
			throw "wrangler exited early (code $($proc.ExitCode))"
		}
		$tail = ""
		if (Test-Path $logPath) {
			$tail = Get-Content $logPath -Raw -ErrorAction SilentlyContinue
		}
		if ($tail -match "Ready on|Ready\s") {
			$ready = $true
			break
		}
		try {
			Invoke-WebRequest -Uri "http://127.0.0.1:$Port/" -Method Head -TimeoutSec 2 | Out-Null
			$ready = $true
			break
		} catch {
			Start-Sleep -Milliseconds 500
		}
	}
	if (-not $ready) {
		Get-Content $logPath, $errPath -ErrorAction SilentlyContinue | Select-Object -Last 40
		throw "wrangler did not become ready within 90s"
	}

	$parts = @("compact=1")
	if ($Url) {
		$parts += "url=" + [uri]::EscapeDataString($Url)
		if ($Service) { $parts += "service=" + [uri]::EscapeDataString($Service) }
		if ($Id) { $parts += "id=" + [uri]::EscapeDataString($Id) }
	} else {
		if (-not (Test-Path $UrlsFile)) {
			throw "URLs file not found: $UrlsFile"
		}
		Write-Host "Catalog: $UrlsFile"
		if ($Service) { $parts += "service=" + [uri]::EscapeDataString($Service) }
		if ($Id) { $parts += "id=" + [uri]::EscapeDataString($Id) }
	}
	$endpoint = "http://127.0.0.1:$Port/?" + ($parts -join "&")
	Write-Host "GET $endpoint"
	$sw = [System.Diagnostics.Stopwatch]::StartNew()
	$resp = Invoke-WebRequest -Uri $endpoint -TimeoutSec $TimeoutSec
	$sw.Stop()
	$body = $resp.Content
	Set-Content -Path $resultPath -Value $body -Encoding utf8

	$j = $body | ConvertFrom-Json

	# Normalize single vs batch shapes
	$results = @()
	if ($j.results) {
		$results = @($j.results)
		Write-Host ("batch ok={0} passed={1} failed={2} count={3} wallMs={4}" -f `
			$j.ok, $j.passed, $j.failed, $j.count, $sw.ElapsedMilliseconds)
	} elseif ($j.batch) {
		$results = @($j.batch.results)
		Write-Host ("single+batch usable={0} wallMs={1}" -f $j.usable, $sw.ElapsedMilliseconds)
	} else {
		$results = @($j)
	}

	$failures = @()
	foreach ($r in $results) {
		$label = if ($r.id) { "$($r.service)/$($r.id)" } else { $r.url }
		$line = ("  [{0}] usable={1} elapsedMs={2} htmlLength={3} title={4} gotoError={5}" -f `
			$label, $r.usable, $r.elapsedMs, $r.htmlLength, $r.title, $(if ($r.gotoError) { $r.gotoError } else { "none" }))
		if ($r.usable -and -not $r.fatal -and -not $r.gotoError) {
			Write-Host $line -ForegroundColor Green
		} else {
			Write-Host $line -ForegroundColor Red
			$why = @()
			if ($r.fatal) { $why += "fatal=$($r.fatal)" }
			if ($r.gotoError) { $why += "gotoError" }
			if (-not $r.usable) { $why += "usable=false" }
			if ($r.challengeLikely) { $why += "challenge" }
			$failures += "$label ($($why -join ', '))"
		}
	}

	if ($resp.StatusCode -ne 200 -or $failures.Count -gt 0) {
		Write-Host "FAIL ($($failures.Count)):" -ForegroundColor Red
		$failures | ForEach-Object { Write-Host "  - $_" }
		Write-Host "Result: $resultPath"
		exit 1
	}

	Write-Host "PASS — $($results.Count) target(s) returned usable BR HTML." -ForegroundColor Green
	Write-Host "Result: $resultPath"
	exit 0
}
finally {
	Stop-Probe
}
