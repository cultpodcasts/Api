<#
.SYNOPSIS
Interactive walkthrough that creates a narrowly-scoped Cloudflare API token
(Account -> D1:Edit + Workers Scripts:Edit) for deploying the search-demo
Worker, using the Cloudflare CLI (`cf`, beta).

.DESCRIPTION
Steps, each with its own checks and recovery hints:
  1. Verify Node/npm are available.
  2. Verify the `cf` CLI is installed (offers to install it globally via npm).
  3. Verify `cf` is signed in (runs `cf auth login` if not).
  4. Resolve the target account (prompts when the user belongs to several).
  5. Look up the "D1 Write" and "Workers Scripts Write" permission groups.
  6. Show a summary and ask for confirmation.
  7. Create the token with an expiry (default 7 days).
  8. Verify the new token against the API and print next steps.

The token value is printed ONCE. Treat it like a password.

.PARAMETER Name
Token name as it appears in the Cloudflare dashboard. Default: cursor-search-demo.

.PARAMETER ExpiryDays
Days until the token expires. Default: 7. Use 0 for no expiry (not recommended).

.PARAMETER AccountId
Skip the account prompt and use this account id.

.EXAMPLE
./new-cf-token.ps1

.EXAMPLE
./new-cf-token.ps1 -Name my-demo-token -ExpiryDays 3 -AccountId 0123456789abcdef0123456789abcdef
#>
[CmdletBinding()]
param(
    [string]$Name = "cursor-search-demo",
    [ValidateRange(0, 365)]
    [int]$ExpiryDays = 7,
    [string]$AccountId
)

$ErrorActionPreference = "Stop"

# cf emits UTF-8 (emoji banner, box-drawing errors). Without this, Windows
# consoles decode it with the legacy OEM codepage and it renders as mojibake.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

function Write-Step([string]$Message) { Write-Host "`n==> $Message" -ForegroundColor Cyan }
function Write-Ok([string]$Message) { Write-Host "    OK: $Message" -ForegroundColor Green }
function Fail([string]$Message, [string]$Hint) {
    Write-Host "`nERROR: $Message" -ForegroundColor Red
    if ($Hint) { Write-Host "HINT:  $Hint" -ForegroundColor Yellow }
    exit 1
}

# cf prints JSON to stdout by default (no --json flag in v0.15.x), mixes in
# banner/update lines, and does not reliably set a nonzero exit code on errors.
# So: run, strip to the first JSON bracket, parse; treat an "Error" box or an
# unparseable result as failure regardless of exit code.
$DashboardHint = "Fallback: create the token in the dashboard - https://dash.cloudflare.com/profile/api-tokens (Create Custom Token; permissions: Account -> D1 -> Edit, Account -> Workers Scripts -> Edit)."

function Invoke-CfJson([string[]]$CfArgs, [string]$What) {
    $raw = (& cf @CfArgs 2>&1 | ForEach-Object { "$_" }) -join "`n"
    if ($raw -match "Unknown argument") {
        Fail "cf did not recognise the arguments while $What :`n$raw" "Your cf version may differ from the one this script was written for. Update it (npm install --global cf@latest) and re-run. $DashboardHint"
    }
    if ($raw -match "No authentication token found|not logged in|Authentication error|Unauthorized|Forbidden") {
        Fail "cf authentication/authorization problem while $What :`n$raw" "Run 'cf auth login' (or 'cf auth login --force'), then re-run. If the OAuth session is not allowed to manage tokens: $DashboardHint"
    }
    # Strip banner/progress lines: parse from the first '[' or '{'.
    $start = $raw.IndexOfAny([char[]]@('[', '{'))
    if ($start -lt 0) {
        Fail "cf returned no JSON while $What :`n$raw" "Re-run the failing command by hand to inspect: cf $($CfArgs -join ' '). $DashboardHint"
    }
    try {
        return $raw.Substring($start) | ConvertFrom-Json
    } catch {
        Fail "Could not parse cf output while $What :`n$raw" "Update cf (npm install --global cf@latest) and re-run. $DashboardHint"
    }
}

# ── 1. node/npm ──────────────────────────────────────────────────────────────
Write-Step "Checking Node.js / npm"
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Fail "npm was not found on PATH." "Install Node.js (https://nodejs.org) or open a shell where nvm/node is initialised, then re-run."
}
Write-Ok "npm $(npm --version)"

# ── 2. cf CLI ────────────────────────────────────────────────────────────────
Write-Step "Checking the Cloudflare CLI (cf)"
if (-not (Get-Command cf -ErrorAction SilentlyContinue)) {
    $answer = Read-Host "cf is not installed. Install globally now with 'npm install --global cf'? [Y/n]"
    if ($answer -and $answer -notmatch '^[Yy]') { Fail "cf is required." "Install it yourself: npm install --global cf" }
    npm install --global cf
    if ($LASTEXITCODE -ne 0 -or -not (Get-Command cf -ErrorAction SilentlyContinue)) {
        Fail "cf installation failed." "Try: npm install --global cf  (check npm prefix/PATH), then re-run this script."
    }
}
Write-Ok "$(cf --version 2>$null | Select-Object -First 1)"

# ── 3. sign-in ───────────────────────────────────────────────────────────────
Write-Step "Checking cf sign-in"
$whoRaw = (& cf user get 2>&1 | ForEach-Object { "$_" }) -join "`n"
if ($whoRaw -match "No authentication token found|not logged in") {
    Write-Host "    Not signed in - opening the browser OAuth flow (cf auth login)..."
    & cf auth login
    $whoRaw = (& cf user get 2>&1 | ForEach-Object { "$_" }) -join "`n"
    if ($whoRaw -match "No authentication token found|not logged in") {
        Fail "Still not signed in after cf auth login." "Complete the browser flow (try 'cf auth login --force'), then re-run the script."
    }
}
Write-Ok "signed in"

# ── 4. account ───────────────────────────────────────────────────────────────
Write-Step "Resolving the target account"
$accounts = Invoke-CfJson @("accounts", "list") "listing accounts"
if (-not $accounts) { Fail "No accounts visible to this user." "Check you logged in with the right Cloudflare user." }
if (-not $AccountId) {
    if (@($accounts).Count -eq 1) {
        $AccountId = $accounts[0].id
        Write-Ok "single account: $($accounts[0].name) ($AccountId)"
    } else {
        Write-Host "    You belong to several accounts:"
        for ($i = 0; $i -lt @($accounts).Count; $i++) { Write-Host ("      [{0}] {1}  {2}" -f $i, $accounts[$i].name, $accounts[$i].id) }
        $pick = Read-Host "    Pick the account number"
        if ($pick -notmatch '^\d+$' -or [int]$pick -ge @($accounts).Count) { Fail "Invalid selection '$pick'." "Re-run and enter one of the listed numbers, or pass -AccountId." }
        $AccountId = $accounts[[int]$pick].id
        Write-Ok "using $($accounts[[int]$pick].name) ($AccountId)"
    }
} else {
    Write-Ok "using -AccountId $AccountId"
}

# ── 5. permission groups ─────────────────────────────────────────────────────
Write-Step "Looking up permission groups (D1 Write, Workers Scripts Write)"
$groups = Invoke-CfJson @("user", "tokens", "permission-groups", "list") "listing permission groups"
$wantNames = @("D1 Write", "Workers Scripts Write")
$want = @($groups | Where-Object { $_.name -in $wantNames })
if (@($want).Count -ne 2) {
    $found = ($want | ForEach-Object { $_.name }) -join ", "
    Fail "Expected 2 permission groups, found $(@($want).Count) ($found)." `
         "Cloudflare may have renamed them. Run: cf user tokens permission-groups list  and look for the D1 and Workers Scripts write/edit groups, then create the token in the dashboard instead."
}
$want | ForEach-Object { Write-Ok "$($_.name) -> $($_.id)" }

# ── 6. confirm ───────────────────────────────────────────────────────────────
Write-Step "Summary"
$expiresOn = if ($ExpiryDays -gt 0) { (Get-Date).AddDays($ExpiryDays).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ") } else { $null }
Write-Host "    Name:        $Name"
Write-Host "    Account:     $AccountId (token works ONLY on this account)"
Write-Host "    Permissions: $($wantNames -join ' + ')"
Write-Host "    Expires:     $(if ($expiresOn) { $expiresOn } else { 'never (not recommended)' })"
$answer = Read-Host "Create this token? [Y/n]"
if ($answer -and $answer -notmatch '^[Yy]') { Write-Host "Aborted - nothing was created."; exit 0 }

# ── 7. create ────────────────────────────────────────────────────────────────
Write-Step "Creating the token"
$policies = ConvertTo-Json -Depth 5 -Compress @(@{
    effect            = "allow"
    resources         = @{ "com.cloudflare.api.account.$AccountId" = "*" }
    permission_groups = @($want | ForEach-Object { @{ id = $_.id } })
})
$cfArgs = @("user", "tokens", "create", "--name", $Name, "--policies", $policies)
if ($expiresOn) { $cfArgs += @("--expires-on", $expiresOn) }
$created = Invoke-CfJson $cfArgs "creating the token"
if (-not $created.value) {
    Fail "The API did not return a token value.`n$(ConvertTo-Json $created -Depth 5)" "The token may still have been created - check: cf user tokens list"
}

# ── 8. verify + hand-off ─────────────────────────────────────────────────────
Write-Step "Verifying the new token against the API"
$previousToken = $env:CLOUDFLARE_API_TOKEN
try {
    $env:CLOUDFLARE_API_TOKEN = $created.value
    $verify = Invoke-CfJson @("user", "tokens", "verify") "verifying the new token"
    Write-Ok "status: $($verify.status)"
} finally {
    $env:CLOUDFLARE_API_TOKEN = $previousToken
}

Write-Host "`n================= TOKEN (shown once - treat as a password) =================" -ForegroundColor Yellow
Write-Host $created.value
Write-Host "=============================================================================" -ForegroundColor Yellow
Write-Host @"

Next steps:
  1. Add it in Cursor: Dashboard -> Cloud Agents -> Secrets -> name CLOUDFLARE_API_TOKEN
     (reaches NEW agent VMs), and/or hand it to the currently running agent.
  2. When the demo deploy is done, remove it:
       cf user tokens list
       cf user tokens delete $($created.id)
"@
