import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { listLocalDocuments, getLocalDocument } from './local-library.mjs';

const staticFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
  ['/data.json', ['data.json', 'application/json; charset=utf-8']],
]);

export function createLocalServer({ root = process.cwd() } = {}) {
  const token = randomBytes(32).toString('hex');
  const cookieName = 'learn_lys_local';
  const server = http.createServer(async (request, response) => {
    const headers = {
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; style-src 'self' 'unsafe-inline'",
      'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store', Vary: 'Origin',
    };
    const send = (status, body, type = 'application/json; charset=utf-8') => {
      response.writeHead(status, { ...headers, 'Content-Type': type });
      response.end(request.method === 'HEAD' ? undefined : body);
    };
    const fail = status => send(status, JSON.stringify({ error: status === 403 ? 'Access denied' : 'Not found' }));
    const port = server.address()?.port;
    const host = request.headers.host;
    if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(host)) return fail(403);
    const origin = `http://${host}`;
    if (request.headers.origin && request.headers.origin !== origin) return fail(403);
    let url;
    try { url = new URL(request.url, origin); } catch { return fail(404); }
    if (url.origin !== origin) return fail(403);
    const foreign = ['cross-site', 'same-site'].includes(request.headers['sec-fetch-site']);
    const navigation = url.pathname === '/' && request.headers['sec-fetch-mode'] === 'navigate' && request.headers['sec-fetch-dest'] === 'document';
    if (foreign && !navigation) return fail(403);
    if (!['GET', 'HEAD'].includes(request.method)) return fail(404);
    try {
      if (url.pathname.startsWith('/api/')) {
        if (foreign) return fail(403);
        const value = request.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) || '';
        if (!/^[a-f0-9]{64}$/.test(value) || !timingSafeEqual(Buffer.from(value), Buffer.from(token))) return fail(403);
        if (url.pathname === '/api/local/status') return send(200, JSON.stringify({ app: 'learn-lys', mode: 'local', version: 1 }));
        if (url.pathname === '/api/local/documents') return send(200, JSON.stringify({ documents: await listLocalDocuments(root) }));
        if (url.pathname === '/api/local/document') return send(200, JSON.stringify({ document: await getLocalDocument(root, url.searchParams.get('id')) }));
        return fail(404);
      }
      const file = staticFiles.get(url.pathname);
      if (!file) return fail(404);
      const directory = path.join(root, 'dist');
      if ((await lstat(directory)).isSymbolicLink() || (await lstat(path.join(directory, file[0]))).isSymbolicLink()) return fail(404);
      const contents = await readFile(path.join(directory, file[0]));
      if (url.pathname === '/') headers['Set-Cookie'] = `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/`;
      send(200, contents, file[1]);
    } catch { fail(404); }
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const server = createLocalServer();
  server.on('error', error => {
    process.stderr.write(error.code === 'EADDRINUSE' ? 'Local port 4318 is already in use. Close the previous local server before restarting.\n' : 'Local server could not start.\n');
    process.exitCode = 1;
  });
  server.listen(4318, '127.0.0.1', () => process.stdout.write('Local learning: http://127.0.0.1:4318\nKeep this process running while reading local documents.\n'));
}
