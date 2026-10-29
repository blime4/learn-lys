import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { once } from 'node:events';
import { createLocalServer } from '../scripts/local-server.mjs';
import { listLocalDocuments, documentId } from '../scripts/local-library.mjs';

async function setup(t, overrides = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'learn-native-'));
  const vault = await mkdtemp(path.join(os.tmpdir(), 'learn-vault-'));
  const projectPath = 'Projects/Learning';
  const privateDir = path.join(vault, projectPath, 'notes', 'private');
  await mkdir(privateDir, { recursive: true });
  await mkdir(path.join(root, '.local'));
  await mkdir(path.join(root, 'dist'));
  await writeFile(path.join(root, 'dist/index.html'), 'Local shell');
  const config = { vaultPath: vault, projectPath, vaultId: 'fixture-vault', documentCards: { 'source.html': 'card.md', 'record.json': 'card.md' } };
  await writeFile(path.join(root, '.local/obsidian.json'), JSON.stringify(config));
  await writeFile(path.join(privateDir, 'card.md'), '# Card');
  await writeFile(path.join(privateDir, 'source.html'), '<h1>Source</h1>');
  await writeFile(path.join(privateDir, 'record.json'), '{}');
  const launched = [];
  const obsidian = { readRegistry: async () => ({ vaults: { 'fixture-vault': { path: vault } } }), launch: async uri => launched.push(uri), ...overrides };
  const server = createLocalServer({ root, obsidian });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (url, { method = 'GET', headers = {}, body } = {}) => new Promise((resolve, reject) => {
    const req = http.request(`${origin}${url}`, { method, headers }, response => {
      let text = '';
      response.setEncoding('utf8'); response.on('data', chunk => { text += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: text }));
    });
    req.on('error', reject); req.end(body);
  });
  const cookie = (await request('/')).headers['set-cookie'][0].split(';')[0];
  const headers = { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json', 'X-Learn-Lys-Action': 'open-obsidian', 'Sec-Fetch-Site': 'same-origin' };
  return { root, vault, config, request, cookie, headers, launched };
}

test('configured library reads existing vault and launches only its registered Markdown target', async t => {
  const { root, request, headers, launched } = await setup(t);
  assert.equal((await listLocalDocuments(root)).length, 3);
  const id = documentId('source.html');
  const document = JSON.parse((await request(`/api/local/document?id=${id}`, { headers })).body).document;
  assert.equal(document.obsidianTarget.available, true);
  assert.equal(document.obsidianTarget.file, ['Projects', 'Learning', 'notes', 'private', 'card.md'].join('/'));
  const response = await request('/api/local/obsidian-open', { method: 'POST', headers, body: JSON.stringify({ documentId: id }) });
  assert.equal(response.status, 200);
  assert.equal(JSON.parse(response.body).launched, true);
  assert.deepEqual(launched, ['obsidian://open?vault=fixture-vault&file=Projects%2FLearning%2Fnotes%2Fprivate%2Fcard.md']);
  const jsonId = documentId('record.json');
  const jsonDocument = JSON.parse((await request(`/api/local/document?id=${jsonId}`, { headers })).body).document;
  assert.equal(jsonDocument.obsidianTarget.available, true);
});

test('native POST blocks missing CSRF checks, oversized bodies and arbitrary arguments', async t => {
  const { request, headers, launched } = await setup(t);
  const body = JSON.stringify({ documentId: documentId('card.md') });
  for (const missing of ['Origin', 'Cookie', 'X-Learn-Lys-Action']) {
    const bad = { ...headers }; delete bad[missing];
    assert.equal((await request('/api/local/obsidian-open', { method: 'POST', headers: bad, body })).status, 403);
  }
  for (const invalid of [{ documentId: 'invalid' }, { documentId: documentId('card.md'), command: 'anything' }, { uri: 'obsidian://open' }, { documentId: documentId('../outside.md') }]) {
    assert.notEqual((await request('/api/local/obsidian-open', { method: 'POST', headers, body: JSON.stringify(invalid) })).status, 200);
  }
  assert.equal((await request('/api/local/obsidian-open', { method: 'POST', headers, body: 'x'.repeat(2049) })).status, 413);
  assert.equal(launched.length, 0);
});

test('invalid card maps, mismatched vault registration and native failures do not claim success', async t => {
  const invalidVault = await setup(t, { readRegistry: async () => ({ vaults: {} }) });
  const body = JSON.stringify({ documentId: documentId('card.md') });
  assert.equal((await invalidVault.request('/api/local/obsidian-open', { method: 'POST', headers: invalidVault.headers, body })).status, 409);
  const mismatched = await setup(t, { readRegistry: async () => ({ vaults: { 'fixture-vault': { path: os.tmpdir() } } }) });
  assert.equal((await mismatched.request('/api/local/obsidian-open', { method: 'POST', headers: mismatched.headers, body })).status, 409);
  const failed = await setup(t, { launch: async () => { throw new Error('native failure with private path'); } });
  const response = await failed.request('/api/local/obsidian-open', { method: 'POST', headers: failed.headers, body });
  assert.equal(response.status, 503);
  assert.doesNotMatch(response.body, /native failure with private path/);
  const mapping = await setup(t);
  mapping.config.documentCards['source.html'] = '../outside.md';
  await writeFile(path.join(mapping.root, '.local/obsidian.json'), JSON.stringify(mapping.config));
  assert.equal((await mapping.request('/api/local/obsidian-open', { method: 'POST', headers: mapping.headers, body: JSON.stringify({ documentId: documentId('source.html') }) })).status, 409);
});

test('project path traversal and missing Markdown cards cannot resolve to native targets', async t => {
  const fixture = await setup(t);
  fixture.config.documentCards = {};
  await writeFile(path.join(fixture.root, '.local/obsidian.json'), JSON.stringify(fixture.config));
  const document = JSON.parse((await fixture.request(`/api/local/document?id=${documentId('source.html')}`, { headers: fixture.headers })).body).document;
  assert.equal(document.obsidianTarget.available, false);
  fixture.config.projectPath = '../outside';
  await writeFile(path.join(fixture.root, '.local/obsidian.json'), JSON.stringify(fixture.config));
  assert.deepEqual(await listLocalDocuments(fixture.root), []);
  assert.equal((await fixture.request('/api/local/obsidian-open', { method: 'POST', headers: fixture.headers, body: JSON.stringify({ documentId: documentId('card.md') }) })).status, 409);
});
