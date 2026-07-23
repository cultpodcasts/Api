# Sets Cloudflare Worker secrets for the preview env via wrangler.
#
# NEVER put real secrets or Azure Function endpoint URLs in this script.
# Load them from a gitignored local file (preferred) or process env vars.
#
# Preferred: copy the example and fill real values locally:
#   copy scripts\local-secrets.preview.env.example scripts\local-secrets.preview.env
#   .\scripts\set-secrets-preview.ps1
#
# File format (KEY=VALUE, one wrangler secret name per line):
#   apikey=...
#   auth0ClientId=...
#   secureEpisodeEndpoint=https://....azurewebsites.net/api/episode
#   ...
#
# Optional: process env vars override file values (same KEY names).
# Rotate Azure Search keys after any historical plaintext commit of apikey.
#
# See docs/worker-secrets.md

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$envName = 'preview'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$secretsFile = Join-Path $PSScriptRoot 'local-secrets.preview.env'

function Import-DotEnvFile([string]$Path) {
    $map = [ordered]@{}
    if (-not (Test-Path -LiteralPath $Path)) {
        return $map
    }
    foreach ($raw in Get-Content -LiteralPath $Path) {
        $line = $raw.Trim()
        if ($line -eq '' -or $line.StartsWith('#')) { continue }
        $eq = $line.IndexOf('=')
        if ($eq -lt 1) {
            throw "Invalid line in $Path (expected KEY=VALUE): $raw"
        }
        $key = $line.Substring(0, $eq).Trim()
        $value = $line.Substring($eq + 1).Trim()
        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        $map[$key] = $value
    }
    return $map
}

function Get-SecretValue([string]$Name, [System.Collections.IDictionary]$FromFile) {
    # Env var wins when set (including empty). Otherwise require the key in the local file.
    $fromEnv = [Environment]::GetEnvironmentVariable($Name)
    if ($null -ne $fromEnv) {
        return $fromEnv
    }
    if ($FromFile.Contains($Name)) {
        return [string]$FromFile[$Name]
    }
    throw "Missing secret '$Name'. Set it in '$secretsFile' (gitignored) or as an environment variable with the same name."
}

if (-not (Test-Path -LiteralPath $secretsFile)) {
    Write-Warning "Secrets file not found: $secretsFile"
    Write-Warning "Copy scripts\local-secrets.preview.env.example to scripts\local-secrets.preview.env and fill real values."
}

Push-Location $repoRoot
try {
    $fromFile = Import-DotEnvFile $secretsFile

    # Keys uploaded to wrangler for this env. Values come ONLY from the local file / env.
    $secretNames = @(
        'apihost'
        'apikey'
        'auth0Audience'
        'auth0Issuer'
        'overrideHost'
        'secureAdminPublishHomepageEndpoint'
        'secureAdminSearchIndexerEndpoint'
        'secureAdminTermsEndpoint'
        'secureDiscoveryCurationEndpoint'
        'secureDiscoveryScheduleEndpoint'
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
        'stagingHostSuffix'
        'auth0ClientId'
    )

    $mustBeNonEmpty = @(
        'apihost', 'apikey', 'auth0Audience', 'auth0Issuer',
        'secureAdminPublishHomepageEndpoint', 'secureAdminSearchIndexerEndpoint', 'secureAdminTermsEndpoint',
        'secureDiscoveryCurationEndpoint', 'secureDiscoveryScheduleEndpoint',
        'secureEpisodeEndpoint', 'secureEpisodePublishEndpoint', 'secureEpisodesOutgoingEndpoint',
        'securePodcastEndpoint', 'securePodcastIndexEndpoint', 'securePublicEpisodeEndpoint',
        'securePushSubscriptionEndpoint', 'secureSubjectEndpoint', 'securePeopleEndpoint', 'secureSubmitEndpoint',
        'stagingHostSuffix', 'auth0ClientId'
    )

    foreach ($name in $secretNames) {
        $value = Get-SecretValue $name $fromFile
        if ($mustBeNonEmpty -contains $name -and [string]::IsNullOrWhiteSpace($value)) {
            throw "Secret '$name' is empty. Fill it in '$secretsFile' before running."
        }
        Write-Host "Setting $name for '$envName'..."
        $value | npx wrangler secret put $name --env $envName
    }

    Write-Host "Done setting secrets for '$envName'."
}
finally {
    Pop-Location
}
