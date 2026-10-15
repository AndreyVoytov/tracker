function reply(message, status, extra = {}) {
  return new Response(message, {
    status,
    headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', ...extra }
  });
}

function parseRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2]) || size === 0) return null;
  let offset;
  let end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    offset = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    offset = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(end) || offset >= size || end < offset) return null;
    end = Math.min(end, size - 1);
  }
  return { offset, length: end - offset + 1 };
}

export function createDownloadWorker(downloads) {
  const routes = new Map(downloads.map(file => ['/' + file.file, file]));
  return {
    async fetch(request, env) {
      const pathname = new URL(request.url).pathname;
      const file = routes.get(pathname);
      if (!file) return env.ASSETS.fetch(request);
      if (!['GET', 'HEAD'].includes(request.method)) return reply('Method not allowed', 405, { Allow: 'GET, HEAD' });
      if (!env.DOWNLOADS) return reply('Downloads are not configured', 503);
      const metadata = await env.DOWNLOADS.head(file.key);
      if (!metadata) return reply('Archive not found', 404);
      const headers = new Headers({
        'Content-Type': file.contentType,
        'Content-Disposition': 'attachment; filename="' + file.file.split('/').pop() + '"',
        'Content-Length': String(metadata.size),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Accept-Ranges': 'bytes',
        ETag: metadata.httpEtag,
        'Last-Modified': metadata.uploaded.toUTCString()
      });
      const noneMatch = request.headers.get('If-None-Match');
      if (noneMatch && (noneMatch === '*' || noneMatch.split(',').map(value => value.trim().replace(/^W\//, '')).includes(metadata.httpEtag))) {
        headers.delete('Content-Length');
        return new Response(null, { status: 304, headers });
      }
      if (request.method === 'HEAD') return new Response(null, { headers });
      let range;
      const rangeValue = request.headers.get('Range');
      const ifRange = request.headers.get('If-Range');
      const canRange = !ifRange || ifRange === metadata.httpEtag || ifRange === metadata.uploaded.toUTCString();
      if (rangeValue && canRange) {
        range = parseRange(rangeValue, metadata.size);
        if (!range) return reply('Range not satisfiable', 416, { 'Content-Range': 'bytes */' + metadata.size });
      }
      const options = { onlyIf: { etagMatches: metadata.etag } };
      if (range) options.range = range;
      const object = await env.DOWNLOADS.get(file.key, options);
      if (!object) return reply('Archive not found', 404);
      if (!('body' in object)) return reply('Archive changed; retry the download', 503, { 'Retry-After': '1' });
      if (range) {
        headers.set('Content-Length', String(range.length));
        headers.set('Content-Range', `bytes ${range.offset}-${range.offset + range.length - 1}/${metadata.size}`);
      }
      return new Response(object.body, { status: range ? 206 : 200, headers });
    }
  };
}
