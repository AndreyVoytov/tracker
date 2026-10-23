param(
    [string]$SourceDirectory = 'C:\proj\trakt_sudeb_3d\out',
    [string]$Branch = 'main',
    [string]$CommitHash,
    [switch]$DryRun
)
. (Join-Path $PSScriptRoot 'common.ps1')

$roadSourceRoot = [IO.Path]::GetFullPath($SourceDirectory)
$roadProjectName = 'andreyvoytov-trakt-sudeb-3d'
foreach ($file in @('index.html', 'editor/index.html', '_headers', 'assets/characters/road-rider-v1.webp', 'assets/roads/perspective/city-gate-v1.webp')) {
    if (-not (Test-Path -LiteralPath (Join-Path $roadSourceRoot $file) -PathType Leaf)) {
        throw ('Missing prepared 3D road build file: ' + $file)
    }
}
if (Get-ChildItem -LiteralPath $roadSourceRoot -Recurse -File | Where-Object Length -gt (25 * 1024 * 1024)) {
    throw 'The game build contains a file exceeding the Pages 25 MiB asset limit.'
}
$roadDeployArguments = @(
    'exec', '--yes', ('--package=wrangler@' + $CloudflareSettings.wranglerVersion), '--',
    'wrangler', 'pages', 'deploy', $roadSourceRoot,
    '--project-name', $roadProjectName, '--branch', $Branch,
    '--commit-dirty=false', '--commit-message', 'Trakt Sudeb 3D: road visuals and gameplay'
)
if ($CommitHash) { $roadDeployArguments += @('--commit-hash', $CommitHash) }
if ($DryRun) {
    Write-Host ('Source: ' + $roadSourceRoot)
    Write-Host ('Project: ' + $roadProjectName)
    Write-Host ('Branch: ' + $Branch)
    Write-Host ('npm ' + ($roadDeployArguments -join ' '))
    return
}
$previousRoadCloudflareAccount = $env:CLOUDFLARE_ACCOUNT_ID
Push-Location -LiteralPath $CloudflareWorkspace
try {
    $env:CLOUDFLARE_ACCOUNT_ID = $CloudflareSettings.accountId
    & npm.cmd @roadDeployArguments
    if ($LASTEXITCODE -ne 0) { throw 'Trakt Sudeb 3D publication failed. Check Wrangler output.' }
} finally {
    $env:CLOUDFLARE_ACCOUNT_ID = $previousRoadCloudflareAccount
    Pop-Location
}
