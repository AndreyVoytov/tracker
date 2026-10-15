param([switch]$DryRun)
. (Join-Path $PSScriptRoot 'common.ps1')

# Run once. New R2 buckets are private; this script never enables r2.dev or a public domain.
Invoke-CloudflareWrangler -Arguments @('r2', 'bucket', 'create', $CloudflareSettings.bucketName) -DryRun:$DryRun
