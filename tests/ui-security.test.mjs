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
