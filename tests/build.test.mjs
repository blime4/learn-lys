import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build, renderNote, assertPublicContent, assertPublishPath, assertTrackedPaths, parseNote } from '../scripts/build.mjs';

test('lesson properties reject invalid tags, numbers, and states with file context', () => {
  for (const [field, value] of [['tags', 'tensor'], ['tags', '[tensor, 5]'], ['minutes', '-1'], ['minutes', '.inf'], ['week', '0'], ['kind', 'unknown'], ['status', 'mastered']]) {
    const text = `---\nid: intro\ntitle: Start\npublish: true\nvisibility: public\n${field}: ${value}\n---\nSafe`;
    assert.throws(() => parseNote(text, 'notes/public/example.md'), new RegExp(`${field}.*example\\.md`));
  }
});

test('public path excludes traversal, absolute paths and private directories', () => {
  assert.equal(assertPublishPath('notes/public/a.md'), 'notes/public/a.md');
  for (const candidate of ['notes/public/../private/a.md', 'notes/private/a.md', 'C:/a.md', 'notes/public/a.html', 'notes/public/x/../../a.md']) {
    assert.throws(() => assertPublishPath(candidate), /publish path/i);
  }
});

test('Obsidian links resolve only published notes without leaking private labels', () => {
  const html = renderNote('[[intro|开始]] [[notes/private/secret|内部秘密]] [[missing]]', new Map([['intro', 'start']]));
  assert.match(html, /href="#lesson\/start"/);
  assert.match(html, /开始/);
  assert.doesNotMatch(html, /secret|内部秘密|missing|notes\/private/);
});

test('raw HTML and unsafe URL schemes cannot become executable output', () => {
  const html = renderNote('<script>alert(1)</script>\n\n[bad](javascript:alert%281%29)\n\n<img src=x onerror=alert(1)>', new Map());
  assert.doesNotMatch(html, /<script|<img|href="javascript:|onerror=/i);
});

test('content gate rejects corporate URLs, internal addresses and local source paths', () => {
  for (const candidate of ['https://fixture.denglin.com/example', 'https://fixture.feishu.cn/example', 'http://10.200.100.50/example', 'C:\\Users\\fixture\\example', 'C:\\workspace\\example', JSON.stringify('D:\\study\\example'), 'notes/private/example.md']) {
    assert.throws(() => assertPublicContent(candidate), /public content/i);
  }
  assert.doesNotThrow(() => assertPublicContent('https://github.com/Miaotofu01/Study-Mate'));
});

test('source gate rejects private tracked paths, but permits test fixtures', () => {
  assert.throws(() => assertTrackedPaths(['learning-state.json']), /private tracked/i);
  assert.throws(() => assertTrackedPaths(['notes/private/a.md']), /private tracked/i);
  assert.doesNotThrow(() => assertTrackedPaths(['tests/build.test.mjs', 'notes/public/a.md', 'site/app.js'], ['notes/public/a.md']));
});

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'learn-lys-'));
  await mkdir(path.join(root, 'notes/public'), { recursive: true });
  await mkdir(path.join(root, 'site'));
  await writeFile(path.join(root, 'site/publish.json'), JSON.stringify(['notes/public/a.md']));
  await writeFile(path.join(root, 'site/site.json'), JSON.stringify({ meta: { title: 'Learn' }, roadmap: [], references: [], glossary: [] }));
  for (const file of ['index.html', 'app.js', 'styles.css']) await writeFile(path.join(root, 'site', file), 'public shell');
  await writeFile(path.join(root, 'notes/public/a.md'), '---\nid: intro\ntitle: Start\npublish: true\nvisibility: public\n---\n# Safe lesson');
  return root;
}

test('build publishes only allowlisted, explicitly public notes', async () => {
  const root = await fixture();
  await writeFile(path.join(root, 'notes/public/secret.md'), 'NEVER PUBLISH');
  await build(root);
  const data = JSON.parse(await readFile(path.join(root, 'dist/data.json'), 'utf8'));
  assert.equal(data.lessons.length, 1);
  assert.equal(data.lessons[0].id, 'intro');
  assert.match(data.lessons[0].html, /Safe lesson/);
  assert.doesNotMatch(JSON.stringify(data), /NEVER PUBLISH/);
  await writeFile(path.join(root, 'notes/public/a.md'), '---\nid: intro\npublish: false\nvisibility: public\n---\n# Safe');
  await assert.rejects(() => build(root), /explicitly public/i);
});

test('build rejects metadata leaks as well as body leaks', async () => {
  const root = await fixture();
  await writeFile(path.join(root, 'site/site.json'), JSON.stringify({ meta: { title: 'https://fixture.denglin.com/example' } }));
  await assert.rejects(() => build(root), /public content/i);
});

test('build rejects directory symlinks pointing outside the public tree', async t => {
  const root = await fixture();
  const outside = await mkdtemp(path.join(os.tmpdir(), 'learn-lys-outside-'));
  await writeFile(path.join(outside, 'a.md'), '---\nid: intro\npublish: true\nvisibility: public\n---\n# Outside');
  try { await symlink(outside, path.join(root, 'notes/public/link'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (error.code === 'EPERM') return t.skip('Host cannot create symlinks'); throw error; }
  await writeFile(path.join(root, 'site/publish.json'), JSON.stringify(['notes/public/link/a.md']));
  await assert.rejects(() => build(root), /symlink/i);
});
