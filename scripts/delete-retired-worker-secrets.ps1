# Deletes Cloudflare Worker secrets that this repo no longer reads.
#
# Default: leftovers unused by BOTH the live Worker and origin-catalog code
#   (gatewayKey, secureAdminTermsEndpoint, securePodcastsEndpoint, azureApiKey).
#
# After the origin-catalog Worker is deployed, pass -AfterOriginCutover to
# remove per-route secure*Endpoint URLs. Do NOT do that while production still
# runs the old getEndpoint(secret URL) Worker.
#
# Never deletes apikey / apihost / azureApiOrigin / Auth0 / overrideHost.
#
# Usage:
#   .\scripts\delete-retired-worker-secrets.ps1
#   .\scripts\delete-retired-worker-secrets.ps1 -AfterOriginCutover
#
# See docs/worker-secrets.md

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [switch] $AfterOriginCutover
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')

# Unused by current source and by live production Worker (Env.ts never bound these).
$alreadyUnused = @(
    'azureApiKey'
    'gatewayKey'
    'secureAdminTermsEndpoint'
    'securePodcastsEndpoint'
)

$originCutoverSecrets = @(
    'secureAdminPublishHomepageEndpoint'
    'secureAdminSearchIndexerEndpoint'
    'secureDiscoveryCurationEndpoint'
    'secureDiscoveryScheduleEndpoint'
    'secureSupportedLanguagesEndpoint'
    'secureTitleCasingRulesEndpoint'
    'secureEpisodeEndpoint'
    'secureEpisodePublishEndpoint'
    'secureEpisodesOutgoingEndpoint'
    'securePodcastEndpoint'
    'securePodcastIndexEndpoint'
    'securePublicEpisodeEndpoint'
    'securePushSubscriptionEndpoint'
    'secureSubjectEndpoint'
    'securePeopleEndpoint'
    'secureSubmitEndpoint'
)

$names = [System.Collections.Generic.List[string]]::new()
foreach ($n in $alreadyUnused) { $names.Add($n) }
if ($AfterOriginCutover) {
    foreach ($n in $originCutoverSecrets) { $names.Add($n) }
}

$targets = @(
    @{ Label = "preview api-preview"; Args = @('--env', 'preview') }
    @{ Label = "production top-level api"; Args = @('--env=') }
)

function Remove-WorkerSecret([string]$Name, [string[]]$WranglerArgs, [string]$Label) {
    Write-Host "Deleting $Name on $Label (ignore if missing)..."
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $output = 'y' | npx wrangler secret delete $Name @WranglerArgs 2>&1 | Out-String
    Write-Host $output
    if ($LASTEXITCODE -ne 0 -and $output -notmatch 'not found') {
        throw "wrangler secret delete $Name on $Label failed"
    }
    $ErrorActionPreference = $prevEap
}

Push-Location $repoRoot
try {
    foreach ($t in $targets) {
        foreach ($name in $names) {
            if ($PSCmdlet.ShouldProcess("$($t.Label)/$name", 'wrangler secret delete')) {
                Remove-WorkerSecret $name $t.Args $t.Label
            }
        }
    }
    Write-Host "Retired-secret delete pass finished."
}
finally {
    Pop-Location
}
