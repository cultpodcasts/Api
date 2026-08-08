# Fails if preview vs production Worker secret key-name sets diverge.
# Compares tracked example files and the $secretNames lists in set-secrets-*.ps1.
#
# Usage (repo root):
#   pwsh ./scripts/assert-secrets-example-parity.ps1

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$previewExample = Join-Path $PSScriptRoot 'local-secrets.preview.env.example'
$productionExample = Join-Path $PSScriptRoot 'local-secrets.production.env.example'
$previewScript = Join-Path $PSScriptRoot 'set-secrets-preview.ps1'
$productionScript = Join-Path $PSScriptRoot 'set-secrets-production.ps1'

function Get-DotEnvKeys([string]$Path) {
    $keys = [System.Collections.Generic.List[string]]::new()
    foreach ($raw in Get-Content -LiteralPath $Path) {
        $line = $raw.Trim()
        if ($line -eq '' -or $line.StartsWith('#')) { continue }
        $eq = $line.IndexOf('=')
        if ($eq -lt 1) {
            throw "Invalid line in $Path (expected KEY=VALUE): $raw"
        }
        $keys.Add($line.Substring(0, $eq).Trim())
    }
    return ($keys | Sort-Object -Unique)
}

function Get-SecretNamesFromScript([string]$Path) {
    $text = Get-Content -LiteralPath $Path -Raw
    if ($text -notmatch '(?s)\$secretNames\s*=\s*@\((.*?)\)') {
        throw "Could not find `$secretNames = @(...) in $Path"
    }
    $block = $Matches[1]
    $names = [regex]::Matches($block, "'([^']+)'") | ForEach-Object { $_.Groups[1].Value }
    if (-not $names -or $names.Count -eq 0) {
        throw "No secret names parsed from `$secretNames in $Path"
    }
    return ($names | Sort-Object -Unique)
}

function Compare-KeySets([string]$LeftLabel, [string[]]$Left, [string]$RightLabel, [string[]]$Right) {
    $onlyLeft = Compare-Object $Left $Right | Where-Object SideIndicator -eq '<=' | ForEach-Object InputObject
    $onlyRight = Compare-Object $Left $Right | Where-Object SideIndicator -eq '=>' | ForEach-Object InputObject
    $ok = $true
    if ($onlyLeft) {
        $ok = $false
        Write-Host "FAIL: keys only in ${LeftLabel}:" -ForegroundColor Red
        $onlyLeft | ForEach-Object { Write-Host "  $_" }
    }
    if ($onlyRight) {
        $ok = $false
        Write-Host "FAIL: keys only in ${RightLabel}:" -ForegroundColor Red
        $onlyRight | ForEach-Object { Write-Host "  $_" }
    }
    return $ok
}

Push-Location $repoRoot
try {
    $previewKeys = Get-DotEnvKeys $previewExample
    $productionKeys = Get-DotEnvKeys $productionExample
    $previewScriptKeys = Get-SecretNamesFromScript $previewScript
    $productionScriptKeys = Get-SecretNamesFromScript $productionScript

    $ok = $true
    $ok = (Compare-KeySets 'local-secrets.preview.env.example' $previewKeys 'local-secrets.production.env.example' $productionKeys) -and $ok
    $ok = (Compare-KeySets 'set-secrets-preview.ps1 $secretNames' $previewScriptKeys 'set-secrets-production.ps1 $secretNames' $productionScriptKeys) -and $ok
    $ok = (Compare-KeySets 'local-secrets.preview.env.example' $previewKeys 'set-secrets-preview.ps1 $secretNames' $previewScriptKeys) -and $ok
    $ok = (Compare-KeySets 'local-secrets.production.env.example' $productionKeys 'set-secrets-production.ps1 $secretNames' $productionScriptKeys) -and $ok

    if (-not $ok) {
        Write-Host ''
        Write-Host 'Preview/production secret key-name sets must match. See docs/worker-secrets.md and .cursor/rules/preview-production-secrets-parity.mdc.' -ForegroundColor Red
        exit 1
    }

    Write-Host "OK: preview/production secret key names match ($($previewKeys.Count) keys)."
    exit 0
}
finally {
    Pop-Location
}
