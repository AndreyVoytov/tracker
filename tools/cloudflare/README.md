# Cloudflare Pages and private R2 downloads

## My Little Universe — Hollow publication

The separate offline build uses `andreyvoytov-my-little-universe-hollow` on the
same account. Supply the unpacked `hollow_offline_package` directory; the ZIP is
not uploaded. Its classic-script archive parts remain below Pages' 25 MiB limit.

```powershell
.\tools\cloudflare\deploy-hollow.ps1 -SourceDirectory 'C:\path\to\hollow_offline_package' -DryRun
.\tools\cloudflare\deploy-hollow.ps1 -SourceDirectory 'C:\path\to\hollow_offline_package'
.\tools\cloudflare\deploy-hollow.ps1 -SourceDirectory 'C:\path\to\hollow_offline_package' -Branch main
```

The default branch `hollow-review` publishes a preview for browser verification.
After verification, publish the same artifact with `-Branch main` to
`https://andreyvoytov-my-little-universe-hollow.pages.dev`. This process does not
merge the game source branch. `-CommitHash` can record its source revision.
The Pages project already exists; no Wrangler `--force` or new permissions are
needed for subsequent deployments.

## Zoo Arrows publication

The adjacent `zoo-art` game uses the same account and pinned Wrangler version from
this directory. Build and check it in `C:\proj\zoo-art`:

```powershell
npm run build
npm run check-art
```

Then publish the prepared `_site` directory from `C:\proj\tracker`:

```powershell
.\tools\cloudflare\deploy-zoo.ps1 -DryRun
.\tools\cloudflare\deploy-zoo.ps1
```

The production project is `andreyvoytov-zoo-arrows` and the URL is
`https://andreyvoytov-zoo-arrows.pages.dev`. The animation review page is
`/art-review.html`. This command uses `npm exec` to bypass the broken local
`npx.ps1` shim. It uploads only the built site; PSD masters remain in the source
project. It does not run the mushrooms deployment or its R2 download workflow.

If a Cloudflare login is needed, an OAuth request restricted to Pages can be
started with:

```powershell
npm exec --yes --package=wrangler@4.151.0 -- wrangler login --scopes account:read pages:write --use-keyring
```

Complete the Cloudflare sign-in and consent in the browser. OAuth credentials
are stored in the OS credential store by `--use-keyring`.

## mushroomsSveta publication

The game and companion pages stay in Cloudflare Pages. Large ZIP downloads are
stored in a private R2 bucket and served by the same Pages site. The download URL
stays `/ideas2/downloads/puzzle-and-ideas-2026-10-06.zip`. There is no GitHub
redirect, public `r2.dev` URL, or separate `workers.dev` download endpoint.

Scripts live in `C:\proj\tracker\tools\cloudflare` because this workspace can
write to tracker. They read the prepared game from
`C:\proj\mushroomsSveta\.pages-dist` without modifying that project.

## First setup

Use PowerShell from `C:\proj\tracker`. Node.js, npm and an authenticated Wrangler
session are required. If necessary, sign in with `npx --yes wrangler login`.
The scripts use the Wrangler version pinned in `mushrooms-sveta.json` through
`npx`; the first run may download that version from npm.
Enable R2 in the Cloudflare dashboard yourself if the account has not enabled it
yet; Cloudflare may ask you to configure billing. The scripts do not accept
billing agreements, create API tokens, or make the bucket public.

Create the bucket once:

```powershell
.\tools\cloudflare\setup-r2.ps1
```

The bucket name, account, source directory and file list are configured in
[mushrooms-sveta.json](mushrooms-sveta.json). Do not enable the bucket's public
development URL or attach a public bucket domain if access will be restricted.

## Upload files manually with one command

Prepare the game using its usual `npm run pages:build` command in the
mushroomsSveta project. Then upload the declared archives:

```powershell
.\tools\cloudflare\upload-r2.ps1
```

This command uploads only the declared downloads. The object key is stable, so
running it again replaces that archive in R2. It uses `--remote`, Standard
storage, ZIP metadata and private cache headers. Files up to 300 MiB are
supported by the Wrangler uploader; larger archives need an S3 multipart tool.
No access keys are saved in the repository.

## Publish the game

After uploading the archives:

```powershell
.\tools\cloudflare\deploy-mushrooms.ps1
```

The script prepares an isolated copy in `.cloudflare-r2/mushrooms-sveta`, omits
the R2 archives from Pages assets, removes their old GitHub redirects, and adds
a download Worker with an R2 binding. Before publishing, it downloads each
remote archive and compares SHA256 with the local file. A missing or mismatched
archive stops publication, so the live route is not switched to an empty bucket.
All other static pages and redirects are preserved. Undeclared files larger
than Pages' 25 MiB limit stop preparation and must be added to the download list.

Generated staging files are ignored by git. Rebuilding can replace only a build
directory marked as belonging to this script, inside this workspace. An existing
source Worker requires an explicit merge rather than being silently overwritten.

Custom prepared source directory:

```powershell
.\tools\cloudflare\upload-r2.ps1 -SourceDirectory 'C:\path\to\.pages-dist'
.\tools\cloudflare\deploy-mushrooms.ps1 -SourceDirectory 'C:\path\to\.pages-dist'
```

Review commands without contacting Cloudflare:

```powershell
.\tools\cloudflare\setup-r2.ps1 -DryRun
.\tools\cloudflare\upload-r2.ps1 -DryRun
.\tools\cloudflare\deploy-mushrooms.ps1 -DryRun
```

`deploy-mushrooms.ps1 -DryRun` prepares the local package and prints the intended
publication command; it does not verify remote objects or publish.

## Closing Pages later

At present, the download route follows the visibility of the existing Pages
site. A private bucket alone does not make the site or its download route private.
The Worker permits only declared archive paths and never redirects to public
storage. Responses use `Cache-Control: private, no-store` and support HEAD and
resumable downloads.

If closing GitHub Pages: first migrate and verify downloads using these scripts,
then the Cloudflare copy no longer needs GitHub Pages. Closing a GitHub repository
and closing the published website are separate settings.

If closing the Cloudflare website: protect the production site, custom domains,
and deployment/preview aliases with Cloudflare Access. Include download routes in
the protection. Verify that signed-out requests cannot open either the game or
the ZIP through any alias. Do not rely only on the built-in preview protection;
production needs its own access policy. Keeping the bucket private avoids an
independent public bucket URL bypassing that policy.

## Checks

```powershell
node --test tools/cloudflare/download-worker.test.mjs
```

The tests cover download headers, ranges, conditional requests, missing objects,
method restrictions and avoiding access to arbitrary R2 object keys.

Official references:

- [R2 CLI](https://developers.cloudflare.com/r2/get-started/cli/)
- [R2 Wrangler commands](https://developers.cloudflare.com/r2/reference/wrangler-commands/)
- [Pages advanced mode](https://developers.cloudflare.com/pages/functions/advanced-mode/)
- [Pages Wrangler configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)
- [Pages preview access](https://developers.cloudflare.com/pages/configuration/preview-deployments/)
