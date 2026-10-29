import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { checkTrackedSources } from '../scripts/public-sources.mjs';

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'public-sources-'));
  await mkdir(path.join(root, 'notes/public'), { recursive: true });
  await mkdir(path.join(root, 'site'));
  await writeFile(path.join(root, 'site/publish.json'), '["notes/public/a.md"]');
  await writeFile(path.join(root, 'notes/public/a.md'), '---\nid: a\ntitle: A\npublish: true\nvisibility: public\n---\nSafe');
  return root;
}

test('unlisted public notes and copied site attachments cannot enter public source', async () => {
  const root = await fixture();
  await assert.rejects(() => checkTrackedSources(root, ['notes/public/unlisted.md']), /private tracked/i);
  await assert.rejects(() => checkTrackedSources(root, ['site/copied-reference.html']), /private tracked/i);
});

test('tracked notes need both public properties and leak-free original content', async () => {
  const root = await fixture();
  const file = 'notes/public/a.md';
  await assert.doesNotReject(() => checkTrackedSources(root, [file]));
  await writeFile(path.join(root, file), '---\nid: a\ntitle: A\npublish: false\nvisibility: public\n---\nSafe');
  await assert.rejects(() => checkTrackedSources(root, [file]), /explicitly public/i);
  await writeFile(path.join(root, file), '---\nid: a\ntitle: A\npublish: true\nvisibility: public\n---\nhttps://fixture.denglin.com/example');
  await assert.rejects(() => checkTrackedSources(root, [file]), /public content/i);
});

test('README and docs are scanned, while synthetic code fixtures remain permitted', async () => {
  const root = await fixture();
  await writeFile(path.join(root, 'README.md'), 'https://fixture.denglin.com/example');
  await assert.rejects(() => checkTrackedSources(root, ['README.md']), /public content/i);
  await mkdir(path.join(root, 'tests'));
  await writeFile(path.join(root, 'tests/example.test.mjs'), 'const sample = "https://fixture.denglin.com/example";');
  await assert.doesNotReject(() => checkTrackedSources(root, ['tests/example.test.mjs']));
  await writeFile(path.join(root, 'tests/example.test.mjs'), 'https://fixture.denglin.com/example'.replace('/example', '/not-a-fixture'));
  await assert.rejects(() => checkTrackedSources(root, ['tests/example.test.mjs']), /public content/i);
  await writeFile(path.join(root, 'tests/example.test.mjs'), ['192', 'GB'].join(' '));
  await assert.rejects(() => checkTrackedSources(root, ['tests/example.test.mjs']), /public content/i);
  await writeFile(path.join(root, 'README.md'), 'Local directory: `notes/private/`; local index: `learning-state.json`.');
  await assert.doesNotReject(() => checkTrackedSources(root, ['README.md']));
  await writeFile(path.join(root, 'README.md'), `Local attachment: ${['notes', 'private', 'confidential-document.html'].join('/')}`);
  await assert.rejects(() => checkTrackedSources(root, ['README.md']), /private attachment/i);
});

test('checking Git index content cannot be bypassed by safe working tree content', async () => {
  const root = await fixture();
  await writeFile(path.join(root, 'README.md'), 'Safe working copy');
  const readIndex = file => file === 'README.md' ? Promise.resolve('https://fixture.denglin.com/example') : readFile(path.join(root, file), 'utf8');
  await assert.rejects(() => checkTrackedSources(root, ['README.md'], readIndex), /public content/i);
});

test('the source gate accepts its own deliberate regression fixture source', async () => {
  const root = await fixture();
  await mkdir(path.join(root, 'tests'));
  await writeFile(path.join(root, 'tests/example.test.mjs'), await readFile(new URL(import.meta.url), 'utf8'));
  await assert.doesNotReject(() => checkTrackedSources(root, ['tests/example.test.mjs']));
});
