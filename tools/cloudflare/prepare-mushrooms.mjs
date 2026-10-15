import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const tools = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(tools, '../..');
const settings = JSON.parse(await fs.readFile(path.join(tools, 'mushrooms-sveta.json'), 'utf8'));
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--source')) throw new Error('Usage: node prepare-mushrooms.mjs [--source <prepared .pages-dist directory>]');
const source = path.resolve(args[1] || settings.sourceDirectory);
const buildRoot = path.join(workspace, '.cloudflare-r2');
const output = path.join(buildRoot, 'mushrooms-sveta');
const marker = '.cloudflare-build-owner.json';
const owner = 'tracker-mushrooms-r2';
const limit = 25 * 1024 * 1024;
const downloadFiles = new Set();
for (const download of settings.downloads) {
  if (download.file.startsWith('/') || download.file.includes('\\') || download.file.split('/').some(part => !part || part === '.' || part === '..') || /["\r\n]/.test(download.file)) throw new Error('Unsafe download path: ' + download.file);
  if (!download.key || /[\r\n]/.test(download.key) || !download.contentType || /[\r\n]/.test(download.contentType)) throw new Error('Invalid R2 download metadata');
  if (downloadFiles.has(download.file)) throw new Error('Duplicate download route');
  downloadFiles.add(download.file);
  if (!(await fs.stat(path.join(source, download.file))).isFile()) throw new Error('Missing download file: ' + download.file);
}
if (!output.startsWith(workspace + path.sep) || source === output || source.startsWith(output + path.sep)) throw new Error('Unsafe build directory');
for (const file of ['index.html', 'js/bundle.js', 'js/vendor.bundle.js']) await fs.access(path.join(source, file));

const entries = [];
async function walk(directory, relative = '') {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const name = relative ? relative + '/' + entry.name : entry.name;
    if (entry.isSymbolicLink()) throw new Error('Symbolic links are not allowed in the publication package: ' + name);
    if (entry.isDirectory()) await walk(path.join(directory, entry.name), name);
    else if (entry.isFile()) {
      if (name === marker || ['_worker.js', '_routes.json'].includes(name)) throw new Error('The source already contains a worker; merge it before publishing.');
      if (downloadFiles.has(name)) continue;
      if ((await fs.stat(path.join(source, name))).size > limit) throw new Error('Add this large file to mushrooms-sveta.json downloads: ' + name);
      entries.push(name);
    }
  }
}
await walk(source);
await fs.mkdir(buildRoot, { recursive: true });
const buildRootStat = await fs.lstat(buildRoot);
if (buildRootStat.isSymbolicLink() || !buildRootStat.isDirectory()) throw new Error('Build root must be a real directory inside the workspace');
try {
  const stat = await fs.lstat(output);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Build destination must be a real directory');
  const saved = JSON.parse(await fs.readFile(path.join(output, marker), 'utf8'));
  if (saved.owner !== owner) throw new Error('Refusing to replace a directory not owned by this build script');
  await fs.rm(output, { recursive: true, force: true });
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  // A destination without our marker is never removed or overwritten.
  try { await fs.access(output); throw new Error('Build directory has no ownership marker'); }
  catch (check) { if (check.code !== 'ENOENT') throw check; }
}
await fs.mkdir(output, { recursive: true });
await fs.writeFile(path.join(output, marker), JSON.stringify({ owner }) + '\n');
for (const relative of entries) {
  const destination = path.join(output, relative);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  if (relative === '_redirects') {
    const redirects = (await fs.readFile(path.join(source, relative), 'utf8')).split(/\r?\n/).filter(line => !settings.downloads.some(file => line.trim().split(/\s+/)[0] === '/' + file.file));
    await fs.writeFile(destination, redirects.join('\n'));
  } else await fs.copyFile(path.join(source, relative), destination);
}
const worker = await fs.readFile(path.join(tools, 'download-worker.mjs'), 'utf8');
await fs.writeFile(path.join(output, '_worker.js'), worker + '\nexport default createDownloadWorker(' + JSON.stringify(settings.downloads) + ');\n');
await fs.writeFile(path.join(output, '_routes.json'), JSON.stringify({ version: 1, include: settings.downloads.map(file => '/' + file.file), exclude: [] }, null, 2) + '\n');
await fs.writeFile(path.join(buildRoot, 'mushrooms-sveta.wrangler.json'), JSON.stringify({
  name: settings.projectName,
  account_id: settings.accountId,
  compatibility_date: '2026-10-14',
  pages_build_output_dir: './mushrooms-sveta',
  r2_buckets: [{ binding: 'DOWNLOADS', bucket_name: settings.bucketName }],
  env: { preview: { r2_buckets: [{ binding: 'DOWNLOADS', bucket_name: settings.bucketName }] } }
}, null, 2) + '\n');
console.log(`Prepared ${entries.length} static files and ${settings.downloads.length} R2 download route(s) in ${output}`);
console.log('R2 bucket remains private. Downloads use the Pages origin; no GitHub redirects or r2.dev endpoints are added.');
