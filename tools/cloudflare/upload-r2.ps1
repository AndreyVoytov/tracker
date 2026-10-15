param([string]$SourceDirectory, [switch]$DryRun)
. (Join-Path $PSScriptRoot 'common.ps1')
if (-not $SourceDirectory) { $SourceDirectory = $CloudflareSettings.sourceDirectory }

foreach ($download in $CloudflareSettings.downloads) {
    $sourceFile = Get-CloudflareDownloadFile -SourceDirectory $SourceDirectory -Download $download
    if ((Get-Item -LiteralPath $sourceFile).Length -gt 300MB) {
        throw 'This archive exceeds the Wrangler single-object upload limit. Use an S3 multipart uploader for files over 300 MiB.'
    }
    $fileName = [IO.Path]::GetFileName($sourceFile)
    if ($fileName -match '["\r\n]') { throw 'Invalid download filename.' }
    $digest = (Get-FileHash -LiteralPath $sourceFile -Algorithm SHA256).Hash
    Write-Host ('Uploading ' + $download.key + ' (SHA256 ' + $digest + ')')
    Invoke-CloudflareWrangler -Arguments @(
        'r2', 'object', 'put', ($CloudflareSettings.bucketName + '/' + $download.key),
        '--remote', '--file', $sourceFile,
        '--content-type', $download.contentType,
        '--content-disposition', ('attachment; filename="' + $fileName + '"'),
        '--cache-control', 'private, no-store'
    ) -DryRun:$DryRun
}
