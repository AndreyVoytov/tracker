param([string]$SourceDirectory, [switch]$DryRun)
. (Join-Path $PSScriptRoot 'common.ps1')
if (-not $SourceDirectory) { $SourceDirectory = $CloudflareSettings.sourceDirectory }

& node (Join-Path $PSScriptRoot 'prepare-mushrooms.mjs') --source $SourceDirectory
if ($LASTEXITCODE -ne 0) { throw 'Preparing the Pages package failed.' }

# Uploads are a separate manual step. Check remote bytes before changing the live download route.
foreach ($download in $CloudflareSettings.downloads) {
    $sourceFile = Get-CloudflareDownloadFile -SourceDirectory $SourceDirectory -Download $download
    if ($DryRun) {
        Write-Host ('Would verify remote archive SHA256 against ' + $sourceFile)
        continue
    }
    $verificationFile = Join-Path $CloudflareBuildDirectory ('verify-' + [guid]::NewGuid().ToString('N') + '.zip')
    try {
        Invoke-CloudflareWrangler -Arguments @(
            'r2', 'object', 'get', ($CloudflareSettings.bucketName + '/' + $download.key),
            '--remote', '--file', $verificationFile
        )
        $localHash = (Get-FileHash -LiteralPath $sourceFile -Algorithm SHA256).Hash
        $remoteHash = (Get-FileHash -LiteralPath $verificationFile -Algorithm SHA256).Hash
        if ($localHash -ne $remoteHash) { throw 'The R2 archive differs from the source. Run upload-r2.ps1 before publishing.' }
    } finally {
        if (Test-Path -LiteralPath $verificationFile) { Remove-Item -LiteralPath $verificationFile -Force }
    }
}

$manifestPath = Join-Path $SourceDirectory 'deployment.json'
$deployArguments = @(
    'pages', 'deploy', (Join-Path $CloudflareBuildDirectory 'mushrooms-sveta'),
    '--config', (Join-Path $CloudflareBuildDirectory 'mushrooms-sveta.wrangler.json'),
    '--project-name', $CloudflareSettings.projectName, '--branch', 'main',
    '--commit-dirty=true', '--commit-message', 'Publish mushroomsSveta with private R2 downloads'
)
if (Test-Path -LiteralPath $manifestPath) {
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    if ($manifest.commit -match '^[a-f0-9]{40}$') { $deployArguments += @('--commit-hash', $manifest.commit) }
}
Invoke-CloudflareWrangler -Arguments $deployArguments -DryRun:$DryRun
