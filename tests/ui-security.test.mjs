import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import sanitizeHtml from 'sanitize-html';

test('reading TOC treats decoded heading IDs as data without injecting tags or attributes', async () => {
  const source = await readFile(new URL('../site/app.js', import.meta.url), 'utf8');
  const escapeDeclaration = source.split('\n').find(line => line.startsWith('const esc ='));
  const start = source.indexOf('function prepareReading() {');
  const end = source.indexOf('\nfunction render()', start);
  assert.ok(escapeDeclaration && start >= 0 && end > start, 'exercise the real UI renderer');
  const maliciousId = 'topic"><img src=x onerror=alert(1)><a onclick="alert(2)';
  const headings = [
    { id: maliciousId, tagName: 'H2', textContent: 'A < B & "quoted"' },
    { id: '', tagName: 'H3', textContent: 'Normal heading' }
  ];
  const article = { querySelectorAll: selector => selector === 'h1,h2,h3' ? headings : [] };
  const toc = { innerHTML: '' };
  vm.runInNewContext(`${escapeDeclaration}\n${source.slice(start, end)}\nprepareReading();`, {
    $: selector => selector === '#lesson-content' ? article : toc,
    location: { hash: '#local-document/example' },
    currentRoute: () => 'local-document'
  });
  const elements = [];
  sanitizeHtml(toc.innerHTML, {
    allowedTags: ['a'],
    allowedAttributes: { a: ['href', 'data-scroll', 'class'] },
    transformTags: {
      '*': (tagName, attribs) => {
        elements.push({ tagName, attribs: { ...attribs } });
        return { tagName, attribs };
      }
    }
  });
  assert.deepEqual(elements.map(element => element.tagName), ['a', 'a']);
  for (const element of elements) assert.deepEqual(Object.keys(element.attribs).sort(), ['class', 'data-scroll', 'href']);
  assert.equal(elements[0].attribs['data-scroll'], maliciousId, 'decoded ID remains intact for getElementById navigation');
  assert.equal(elements[1].attribs['data-scroll'], 'section-1');
  assert.equal(elements[0].attribs.href, '#local-document/example');
  assert.match(toc.innerHTML, /A &lt; B &amp; &quot;quoted&quot;/);
});

async function obsidianHarness({ local = true, response = { launched: true }, ok = true } = {}) {
  const source = await readFile(new URL('../site/app.js', import.meta.url), 'utf8');
  const start = source.indexOf('async function openObsidianTarget(');
  const end = source.indexOf('\nfunction localInstructions()', start);
  assert.ok(start >= 0 && end > start, 'real local-only Obsidian launcher exists');
  const calls = [], messages = [];
  const context = vm.createContext({
    isLocalOrigin: local,
    localState: { documents: [{ id: 'document-1' }] },
    data: { lessons: [{ id: 'lesson-1' }] },
    notify: message => messages.push(message),
    fetch: async (...args) => {
      calls.push(args);
      return { ok, status: ok ? 200 : 422, json: async () => response };
    }
  });
  vm.runInContext(source.slice(start, end), context);
  return { context, calls, messages, invoke: async target => {
    context.target = target;
    context.button = { disabled: false };
    await vm.runInContext('openObsidianTarget(target, button)', context);
  } };
}

test('Obsidian launch is local-only and sends an ID with the same-origin action contract', async () => {
  const publicPage = await obsidianHarness({ local: false });
  await publicPage.invoke({ documentId: 'document-1' });
  assert.equal(publicPage.calls.length, 0, 'public pages never contact a local API');
  const localPage = await obsidianHarness();
  await localPage.invoke({ documentId: 'document-1' });
  assert.equal(localPage.calls.length, 1);
  const [url, options] = localPage.calls[0];
  assert.equal(url, '/api/local/obsidian-open');
  assert.equal(options.method, 'POST');
  assert.equal(options.credentials, 'same-origin');
  assert.equal(options.headers['Content-Type'], 'application/json');
  assert.equal(options.headers['X-Learn-Lys-Action'], 'open-obsidian');
  assert.deepEqual(JSON.parse(options.body), { documentId: 'document-1' });
  assert.equal(localPage.messages.at(-1), '已请求 Obsidian 打开，请查看桌面应用');
  assert.equal(localPage.context.button.disabled, false);
  await localPage.invoke({ lessonId: 'lesson-1' });
  assert.deepEqual(JSON.parse(localPage.calls[1][1].body), { lessonId: 'lesson-1' });
});

test('Obsidian launch surfaces configuration failures without claiming success', async () => {
  const failed = await obsidianHarness({ ok: false, response: { error: '未配置对应资料的 Markdown 阅读卡' } });
  await failed.invoke({ documentId: 'document-1' });
  assert.match(failed.messages.at(-1), /Markdown 阅读卡/);
  assert.doesNotMatch(failed.messages.join(' '), /已请求|已打开/);
  assert.equal(failed.context.button.disabled, false);
  const unknown = await obsidianHarness();
  await unknown.invoke({ documentId: 'not-indexed' });
  assert.equal(unknown.calls.length, 0);
});

test('public Obsidian controls do not hardcode a vault or use protocol launch links', async () => {
  const source = await readFile(new URL('../site/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /obsidian:\/\/open\?vault=learn-lys/);
  assert.doesNotMatch(source, /learn-lys 的仓库作为 vault/);
});

test('local reader disables Obsidian for an original without a mapped Markdown reading card', async () => {
  const source = await readFile(new URL('../site/app.js', import.meta.url), 'utf8');
  const escapeDeclaration = source.split('\n').find(line => line.startsWith('const esc ='));
  const start = source.indexOf('function localDocumentPage(id) {');
  const end = source.indexOf('\nfunction notify(', start);
  assert.ok(start >= 0 && end > start);
  const record = { phase: 'loaded', document: {
    id: 'html-1', title: 'Reference', kind: 'HTML', relativePath: 'reference/example.html',
    html: '<p>Local body</p>', obsidianPath: 'reference/example.html',
    obsidianTarget: { available: false, reason: '尚未配置 Markdown 阅读卡 <unsafe>' }
  } };
  const context = vm.createContext({ isLocalOrigin: true, localState: { phase: 'connected' },
    localDocuments: new Map([['html-1', record]]), privateProgress: { read: [] }, badge: () => '' });
  const html = vm.runInContext(`${escapeDeclaration}\n${source.slice(start, end)}\nlocalDocumentPage('html-1');`, context);
  const controls = [];
  sanitizeHtml(html, { transformTags: { button: (tagName, attribs) => {
    if (attribs['data-action'] === 'local-obsidian-open') controls.push(attribs);
    return { tagName, attribs };
  } } });
  assert.equal(controls.length, 1);
  assert.equal(controls[0].disabled, '');
  assert.match(html, /尚未配置 Markdown 阅读卡 &lt;unsafe&gt;/);
  assert.doesNotMatch(html, /obsidian:\/\//);
});
