import test from 'node:test';
import assert from 'node:assert/strict';
import { createDownloadWorker } from './download-worker.mjs';

const archive = { file: 'ideas2/downloads/archive.zip', key: 'private/archive.zip', contentType: 'application/zip' };
const url = 'https://example.pages.dev/' + archive.file;
function fixture() {
  const calls = [];
  const bytes = new TextEncoder().encode('0123456789');
  const metadata = { size: bytes.length, etag: 'abc', httpEtag: '"abc"', uploaded: new Date('2026-10-14T10:00:00Z') };
  const env = {
    DOWNLOADS: {
      async head(key) { calls.push(['head', key]); return metadata; },
      async get(key, options) {
        calls.push(['get', key, options]);
        const range = options.range;
        return { ...metadata, body: range ? bytes.slice(range.offset, range.offset + range.length) : bytes };
      }
    },
    ASSETS: { async fetch(request) { calls.push(['assets', request.url]); return new Response('static page'); } }
  };
  return { env, calls, worker: createDownloadWorker([archive]) };
}

test('archive is served on the Pages origin with attachment and private caching headers', async () => {
  const { env, calls, worker } = fixture();
  const response = await worker.fetch(new Request(url), env);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '0123456789');
  assert.equal(response.headers.get('Content-Type'), 'application/zip');
  assert.equal(response.headers.get('Content-Disposition'), 'attachment; filename="archive.zip"');
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(response.headers.get('Content-Length'), '10');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.deepEqual(calls[1], ['get', archive.key, { onlyIf: { etagMatches: 'abc' } }]);
  assert.ok(!response.headers.has('Location'));
});

test('HEAD reads metadata without fetching the file body', async () => {
  const { env, calls, worker } = fixture();
  const response = await worker.fetch(new Request(url, { method: 'HEAD' }), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Length'), '10');
  assert.equal(await response.text(), '');
  assert.deepEqual(calls, [['head', archive.key]]);
});

for (const [header, body, contentRange] of [
  ['bytes=2-5', '2345', 'bytes 2-5/10'],
  ['bytes=7-', '789', 'bytes 7-9/10'],
  ['bytes=-3', '789', 'bytes 7-9/10'],
  ['bytes=8-100', '89', 'bytes 8-9/10']
]) {
  test('resuming downloads supports ' + header, async () => {
    const { env, worker } = fixture();
    const response = await worker.fetch(new Request(url, { headers: { Range: header } }), env);
    assert.equal(response.status, 206);
    assert.equal(await response.text(), body);
    assert.equal(response.headers.get('Content-Range'), contentRange);
    assert.equal(response.headers.get('Content-Length'), String(body.length));
  });
}

test('invalid, multiple and out-of-bounds ranges return 416 without reading the object', async () => {
  for (const range of ['bytes=11-', 'bytes=5-2', 'bytes=-0', 'bytes=0-1,3-4', 'bytes=-']) {
    const { env, calls, worker } = fixture();
    const response = await worker.fetch(new Request(url, { headers: { Range: range } }), env);
    assert.equal(response.status, 416);
    assert.equal(response.headers.get('Content-Range'), 'bytes */10');
    assert.deepEqual(calls, [['head', archive.key]]);
  }
});

test('a stale If-Range validator downloads the complete current archive', async () => {
  const { env, worker } = fixture();
  const response = await worker.fetch(new Request(url, { headers: { Range: 'bytes=5-', 'If-Range': '"old"' } }), env);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '0123456789');
  assert.ok(!response.headers.has('Content-Range'));
});

test('conditional requests return 304 without downloading bytes', async () => {
  const { env, calls, worker } = fixture();
  const response = await worker.fetch(new Request(url, { headers: { 'If-None-Match': 'W/"abc"' } }), env);
  assert.equal(response.status, 304);
  assert.ok(!response.headers.has('Content-Length'));
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.deepEqual(calls, [['head', archive.key]]);
});

test('POST cannot write to the bucket through the download route', async () => {
  const { env, calls, worker } = fixture();
  const response = await worker.fetch(new Request(url, { method: 'POST' }), env);
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'GET, HEAD');
  assert.deepEqual(calls, []);
});

test('unconfigured binding and missing objects fail without redirecting to GitHub', async () => {
  const { env, worker } = fixture();
  const unconfigured = await worker.fetch(new Request(url), {});
  assert.equal(unconfigured.status, 503);
  env.DOWNLOADS.head = async () => null;
  const missing = await worker.fetch(new Request(url), env);
  assert.equal(missing.status, 404);
  assert.ok(!missing.headers.has('Location'));
});

test('an archive updated during download is retried instead of returning mismatched bytes', async () => {
  const { env, worker } = fixture();
  env.DOWNLOADS.get = async () => ({ size: 20 });
  const response = await worker.fetch(new Request(url), env);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Retry-After'), '1');
});

test('static pages and undeclared object paths cannot read arbitrary bucket objects', async () => {
  for (const pathname of ['/index.html', '/private/archive.zip', '/ideas2/downloads/secret.zip', '/ideas2/downloads/%61rchive.zip']) {
    const { env, calls, worker } = fixture();
    const target = 'https://example.pages.dev' + pathname;
    const response = await worker.fetch(new Request(target), env);
    assert.equal(await response.text(), 'static page');
    assert.deepEqual(calls, [['assets', target]]);
  }
});
