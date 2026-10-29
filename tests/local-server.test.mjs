import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rename } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { once } from 'node:events';
import { createLocalServer } from '../scripts/local-server.mjs';

async function setup(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'local-learn-'));
  const privateDir = path.join(root, 'notes', 'private');
  await mkdir(privateDir, { recursive: true });
  await mkdir(path.join(root, 'dist'));
  await writeFile(path.join(root, 'dist/index.html'), '<h1>Local shell</h1>');
  const vaultLink = ['notes', 'private', 'second.html'].join('/');
  await writeFile(path.join(privateDir, 'intro.md'), `# Private intro\n\n[[second|Continue]]\n\n[[${vaultLink}|Full path]]`);
  await writeFile(path.join(privateDir, 'second.html'), '<title>Second</title><h1 id="topic">Useful lesson</h1><a href="#topic">Jump</a><script>bad()</script><style>bad</style><img src="https://example.test/pixel"><iframe src="https://example.test"></iframe><table><tr><td>Kept</td></tr></table>');
  await writeFile(path.join(privateDir, 'record.json'), '{"value":"<script>bad()</script>"}');
  const server = createLocalServer({ root });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const port = server.address().port;
  const request = (url, headers = {}) => new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: url, headers }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
    });
    req.on('error', reject);
  });
  const entry = await request('/');
  const cookie = entry.headers['set-cookie'][0].split(';')[0];
  return { root, privateDir, port, request, cookie, entry };
}

test('loopback local API requires a root-issued cookie and exact same origin', async t => {
  const { request, cookie, port, entry } = await setup(t);
  assert.equal(entry.status, 200);
  assert.match(entry.headers['set-cookie'][0], /HttpOnly; SameSite=Strict/);
  assert.equal((await request('/api/local/documents')).status, 403);
  assert.equal((await request('/api/local/status', { Cookie: cookie })).status, 200);
  assert.equal((await request('/api/local/documents', { Cookie: cookie, Origin: 'https://example.test' })).status, 403);
  assert.equal((await request('/api/local/documents', { Cookie: cookie, Host: `evil.test:${port}` })).status, 403);
  assert.equal((await request('/api/local/documents', { Cookie: cookie, 'Sec-Fetch-Site': 'same-site' })).status, 403);
  assert.equal((await request('/app.js', { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  const crossNavigation = await request('/', { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document' });
  assert.equal(crossNavigation.status, 200);
  assert.equal(entry.headers['access-control-allow-origin'], undefined);
  assert.match(entry.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.equal(entry.headers['cache-control'], 'no-store');
});

test('local documents are sanitized, linked and never served as raw repository files', async t => {
  const { request, cookie } = await setup(t);
  const headers = { Cookie: cookie };
  const list = JSON.parse((await request('/api/local/documents', headers)).body).documents;
  assert.equal(list.length, 3);
  const intro = list.find(item => item.relativePath === 'intro.md');
  const second = list.find(item => item.relativePath === 'second.html');
  const document = JSON.parse((await request(`/api/local/document?id=${intro.id}`, headers)).body).document;
  assert.match(document.html, new RegExp(`#local-document/${second.id}`));
  assert.match(document.html, /Full path<\/a>/);
  assert.equal(document.obsidianPath, ['notes', 'private', 'intro.md'].join('/'));
  const html = JSON.parse((await request(`/api/local/document?id=${second.id}`, headers)).body).document.html;
  assert.match(html, /Useful lesson|Kept/);
  assert.match(html, /id="topic"/);
  assert.doesNotMatch(html, /<script|<style|<img|<iframe|example\.test/i);
  const json = list.find(item => item.kind === 'json');
  const jsonHtml = JSON.parse((await request(`/api/local/document?id=${json.id}`, headers)).body).document.html;
  assert.match(jsonHtml, /&lt;script&gt;/);
  for (const url of [['', 'notes', 'private', 'intro.md'].join('/'), '/package.json', '/api/local/document?id=Li4vUkVBRE1FLm1k', '/api/local/document?id=L2V0Yy9wYXNzd2Q']) {
    assert.equal((await request(url, headers)).status, 404);
  }
});

test('index skips symlinks and oversized documents, and errors omit absolute paths', async t => {
  const { root, privateDir, request, cookie } = await setup(t);
  await writeFile(path.join(privateDir, 'oversized.md'), 'x'.repeat(5 * 1024 * 1024 + 1));
  const outside = path.join(root, 'outside');
  await mkdir(outside);
  await writeFile(path.join(outside, 'hidden.md'), '# Hidden');
  try { await symlink(outside, path.join(privateDir, 'link'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (error.code !== 'EPERM') throw error; }
  const list = JSON.parse((await request('/api/local/documents', { Cookie: cookie })).body).documents;
  assert.equal(list.length, 3);
  const error = await request(`/api/local/document?id=${Buffer.from('oversized.md').toString('base64url')}`, { Cookie: cookie });
  assert.equal(error.status, 404);
  assert.doesNotMatch(error.body, /local-learn-|oversized|[A-Z]:/);
});

test('a separate server instance does not accept an earlier session cookie', async t => {
  const previous = await setup(t);
  const current = await setup(t);
  assert.equal((await current.request('/api/local/status', { Cookie: previous.cookie })).status, 403);
  assert.equal((await current.request('/api/local/status', { Cookie: current.cookie })).status, 200);
});

test('a symlink replacing the private root does not expose documents', async t => {
  const { root, privateDir, request, cookie } = await setup(t);
  const saved = path.join(root, 'saved-private');
  await rename(privateDir, saved);
  try { await symlink(saved, privateDir, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (error.code === 'EPERM') return t.skip('Host cannot create symlinks'); throw error; }
  const list = await request('/api/local/documents', { Cookie: cookie });
  assert.equal(list.status, 200);
  assert.deepEqual(JSON.parse(list.body).documents, []);
  const item = await request(`/api/local/document?id=${Buffer.from('intro.md').toString('base64url')}`, { Cookie: cookie });
  assert.equal(item.status, 404);
});

test('local Wikilinks resolve attachments, parent-relative notes, and vault paths inside the index', async t => {
  const { privateDir, request, cookie } = await setup(t);
  await mkdir(path.join(privateDir, 'reference'));
  await writeFile(path.join(privateDir, 'reference/attached.html'), '<h1>Attachment</h1>');
  const vaultTarget = ['notes', 'private', 'reference', 'attached.html'].join('/');
  await writeFile(path.join(privateDir, 'reference/index.md'), `# Index\n[[attached.html|Attachment]]\n[[../intro|Parent]]\n[[${vaultTarget}|Vault]]`);
  const id = Buffer.from('reference/index.md').toString('base64url');
  const document = JSON.parse((await request(`/api/local/document?id=${id}`, { Cookie: cookie })).body).document;
  assert.match(document.html, new RegExp(`#local-document/${Buffer.from('reference/attached.html').toString('base64url')}`));
  assert.match(document.html, new RegExp(`#local-document/${Buffer.from('intro.md').toString('base64url')}`));
  assert.match(document.html, />Attachment<\/a>/);
  assert.match(document.html, />Vault<\/a>/);
});

test('local index stops before directory depth beyond sixteen', async t => {
  const { privateDir, request, cookie } = await setup(t);
  const inside = path.join(privateDir, ...Array(16).fill('d'));
  await mkdir(path.join(inside, 'd'), { recursive: true });
  await writeFile(path.join(inside, 'inside.md'), '# Within depth');
  await writeFile(path.join(inside, 'd', 'outside.md'), '# Beyond depth');
  const documents = JSON.parse((await request('/api/local/documents', { Cookie: cookie })).body).documents;
  assert.equal(documents.length, 4);
  assert.equal(documents.some(item => item.title === 'Beyond depth'), false);
});
