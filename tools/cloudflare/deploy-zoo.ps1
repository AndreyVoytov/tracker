param([string]$SourceDirectory, [switch]$DryRun)
. (Join-Path $PSScriptRoot 'common.ps1')

if (-not $SourceDirectory) {
    $SourceDirectory = Join-Path $CloudflareWorkspace '../zoo-art/_site'
}
$zooSourceRoot = [IO.Path]::GetFullPath($SourceDirectory)
$zooProjectName = 'andreyvoytov-zoo-arrows'

foreach ($file in @('index.html', 'game.js', 'animal-rig.js', 'zoo-audio.js', 'zoo-polish.css', 'config/animal-rigs.json', 'art-review.html')) {
    if (-not (Test-Path -LiteralPath (Join-Path $zooSourceRoot $file) -PathType Leaf)) {
        throw ('Missing zoo build file: ' + $file + '. Run npm run build in zoo-art first.')
    }
}
$oversized = Get-ChildItem -LiteralPath $zooSourceRoot -Recurse -File | Where-Object Length -gt (25 * 1024 * 1024)
if ($oversized) { throw 'The zoo build contains a file exceeding the Pages 25 MiB asset limit.' }

# Use the cmd shim: the PowerShell npm/npx shims misparse invocations with '&' and splatted arguments.
$deployArguments = @(
    'exec', '--yes', ('--package=wrangler@' + $CloudflareSettings.wranglerVersion), '--',
    'wrangler', 'pages', 'deploy', $zooSourceRoot,
    '--project-name', $zooProjectName, '--branch', 'main',
    '--commit-dirty=true', '--commit-message', 'Zoo active poses, generated UI, three-cluster cleanup and audio'
)
if ($DryRun) {
    Write-Host ('Source: ' + $zooSourceRoot)
    Write-Host ('Project: ' + $zooProjectName)
    Write-Host ('Wrangler: ' + $CloudflareSettings.wranglerVersion)
    Write-Host ('Production URL: https://' + $zooProjectName + '.pages.dev')
    Write-Host ('npm ' + ($deployArguments -join ' '))
    return
}

$previousZooCloudflareAccount = $env:CLOUDFLARE_ACCOUNT_ID
Push-Location -LiteralPath $CloudflareWorkspace
try {
    $env:CLOUDFLARE_ACCOUNT_ID = $CloudflareSettings.accountId
    & npm.cmd @deployArguments
    if ($LASTEXITCODE -ne 0) { throw 'Zoo publication failed. Check the Cloudflare login and the Wrangler output.' }
} finally {
    $env:CLOUDFLARE_ACCOUNT_ID = $previousZooCloudflareAccount
    Pop-Location
}
