$ErrorActionPreference = 'Stop'
$CloudflareToolsDirectory = $PSScriptRoot
$CloudflareWorkspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$CloudflareSettings = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'mushrooms-sveta.json') -Raw | ConvertFrom-Json
$CloudflareBuildDirectory = Join-Path $CloudflareWorkspace '.cloudflare-r2'

function Invoke-CloudflareWrangler {
    param([Parameter(Mandatory)][string[]]$Arguments, [switch]$DryRun)
    $wranglerPackage = 'wrangler@' + $CloudflareSettings.wranglerVersion
    if ($DryRun) {
        Write-Host ('npx --yes ' + $wranglerPackage + ' ' + ($Arguments -join ' '))
        return
    }
    $previousCloudflareAccount = $env:CLOUDFLARE_ACCOUNT_ID
    try {
        $env:CLOUDFLARE_ACCOUNT_ID = $CloudflareSettings.accountId
        & npx --yes $wranglerPackage @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw 'Cloudflare command failed. Check Wrangler login and whether R2 is enabled in your Cloudflare account.'
        }
    } finally {
        $env:CLOUDFLARE_ACCOUNT_ID = $previousCloudflareAccount
    }
}

function Get-CloudflareDownloadFile {
    param([Parameter(Mandatory)][string]$SourceDirectory, [Parameter(Mandatory)]$Download)
    $sourceRoot = [IO.Path]::GetFullPath($SourceDirectory).TrimEnd([char[]]@('\', '/'))
    $sourceFile = [IO.Path]::GetFullPath((Join-Path $sourceRoot $Download.file))
    if (-not $sourceFile.StartsWith($sourceRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Download file must stay inside the source directory.'
    }
    if (-not (Test-Path -LiteralPath $sourceFile -PathType Leaf)) {
        throw ('Missing archive: ' + $sourceFile + '. Build mushroomsSveta with npm run pages:build first.')
    }
    return $sourceFile
}
