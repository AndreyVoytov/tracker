param(
    [Parameter(Mandatory)][string]$SourceDirectory,
    [ValidateSet('hollow-review', 'main')][string]$Branch = 'hollow-review',
    [string]$CommitHash,
    [switch]$DryRun
)
. (Join-Path $PSScriptRoot 'common.ps1')

$hollowSourceRoot = [IO.Path]::GetFullPath($SourceDirectory)
$hollowProjectName = 'andreyvoytov-my-little-universe-hollow'
foreach ($file in @('index.html', 'offline_loader.js', 'offline-manifest.json', 'dmloader.js', 'Universe_wasm.js')) {
    if (-not (Test-Path -LiteralPath (Join-Path $hollowSourceRoot $file) -PathType Leaf)) {
        throw ('Missing Hollow offline build file: ' + $file)
    }
}
$hollowFiles = @(Get-ChildItem -LiteralPath $hollowSourceRoot -Recurse -File)
if ($hollowFiles | Where-Object Length -gt (25 * 1024 * 1024)) {
    throw 'The Hollow build contains a file exceeding the Pages 25 MiB asset limit.'
}
if ($hollowFiles | Where-Object Extension -eq '.zip') {
    throw 'Publish the unpacked offline game directory without ZIP downloads.'
}
$hollowDeployArguments = @(
    'exec', '--yes', ('--package=wrangler@' + $CloudflareSettings.wranglerVersion), '--',
    'wrangler', 'pages', 'deploy', $hollowSourceRoot,
    '--project-name', $hollowProjectName, '--branch', $Branch,
    '--commit-dirty=true', '--commit-message', 'Hollow web rendering fixes and local resource button'
)
if ($CommitHash) { $hollowDeployArguments += @('--commit-hash', $CommitHash) }
if ($DryRun) {
    Write-Host ('Source: ' + $hollowSourceRoot)
    Write-Host ('Project: ' + $hollowProjectName)
    Write-Host ('Branch: ' + $Branch)
    Write-Host ('npm ' + ($hollowDeployArguments -join ' '))
    return
}
$previousHollowCloudflareAccount = $env:CLOUDFLARE_ACCOUNT_ID
Push-Location -LiteralPath $CloudflareWorkspace
try {
    $env:CLOUDFLARE_ACCOUNT_ID = $CloudflareSettings.accountId
    & npm.cmd @hollowDeployArguments
    if ($LASTEXITCODE -ne 0) { throw 'Hollow publication failed. Check Wrangler output.' }
} finally {
    $env:CLOUDFLARE_ACCOUNT_ID = $previousHollowCloudflareAccount
    Pop-Location
}
