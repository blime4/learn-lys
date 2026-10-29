import { lstat, realpath, opendir, open, constants } from 'node:fs/promises';
import path from 'node:path';
import { marked, Renderer } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { resolveProject, secureDirectory } from './local-config.mjs';

const maxBytes = 5 * 1024 * 1024;
const maxDocuments = 1000;
const maxDepth = 16;
const maxEntries = 5000;
const extensions = new Set(['.md', '.html', '.json']);
const tags = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'strong', 'em', 'del', 'hr', 'br', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a', 'span', 'div', 'section', 'article', 'dl', 'dt', 'dd'];
const escape = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const textOnly = html => sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).trim();
export const documentId = relative => Buffer.from(relative, 'utf8').toString('base64url');

function validRelative(relative) {
  return relative && !path.isAbsolute(relative) && !relative.includes('\\') && !relative.includes(':') && !relative.includes('\0') && relative.split('/').every(part => part && part !== '.' && part !== '..') && extensions.has(path.extname(relative));
}

async function libraryRoot(root) {
  const { projectRoot } = await resolveProject(root);
  return secureDirectory(path.join(projectRoot, 'notes', 'private'));
}

export async function readDocumentFile(base, relative, previewBytes = 0) {
  if (!validRelative(relative)) throw new Error('Not found');
  let cursor = base;
  for (const part of relative.split('/')) {
    cursor = path.join(cursor, part);
    if ((await lstat(cursor)).isSymbolicLink()) throw new Error('Not found');
  }
  const resolved = await realpath(cursor);
  const inside = path.relative(base, resolved);
  if (!inside || inside.startsWith('..') || path.isAbsolute(inside)) throw new Error('Not found');
  const handle = await open(cursor, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maxBytes) throw new Error('Not found');
    let buffer;
    if (previewBytes) {
      buffer = Buffer.alloc(Math.min(stat.size, previewBytes));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      buffer = buffer.subarray(0, bytesRead);
    } else buffer = await handle.readFile();
    if (buffer.length > maxBytes || await realpath(cursor) !== resolved) throw new Error('Not found');
    return buffer.toString('utf8');
  } finally { await handle.close(); }
}

function metadata(relative, source) {
  const kind = path.extname(relative).slice(1);
  const heading = kind === 'html' ? /<title[^>]*>([\s\S]*?)<\/title>/i.exec(source)?.[1] : /^#\s+(.+)$/m.exec(source)?.[1];
  const title = heading ? textOnly(heading).slice(0, 180) : path.basename(relative, path.extname(relative));
  return { id: documentId(relative), title: title || path.basename(relative), kind, relativePath: relative };
}

export async function listLocalDocuments(root) {
  let base;
  try { base = await libraryRoot(root); } catch { return []; }
  const documents = [];
  let visited = 0;
  async function visit(relative = '', depth = 0) {
    if (depth > maxDepth || documents.length >= maxDocuments || visited >= maxEntries) return;
    for await (const entry of await opendir(path.join(base, relative))) {
      if (documents.length >= maxDocuments || visited++ >= maxEntries) return;
      if (entry.isSymbolicLink() || entry.name.startsWith('.')) continue;
      const next = relative ? `${relative}/${entry.name}` : entry.name;
      try {
        const stat = await lstat(path.join(base, next));
        if (stat.isSymbolicLink()) continue;
        if (stat.isDirectory()) await visit(next, depth + 1);
        else if (stat.isFile() && validRelative(next) && stat.size <= maxBytes) documents.push(metadata(next, await readDocumentFile(base, next, 64 * 1024)));
      } catch { /* A removed, unreadable, or unsafe document is not part of the index. */ }
    }
  }
  await visit();
  return documents.sort((a, b) => a.relativePath.localeCompare(b.relativePath, 'zh-CN'));
}

function sanitizeDocument(html) {
  return sanitizeHtml(html, {
    allowedTags: tags,
    allowedAttributes: { a: ['href', 'title'], code: ['class'], th: ['colspan', 'rowspan'], td: ['colspan', 'rowspan'], h1: ['id'], h2: ['id'], h3: ['id'], h4: ['id'], h5: ['id'], h6: ['id'] },
    allowedSchemes: ['https', 'http', 'mailto'], allowProtocolRelative: false,
    transformTags: { a: (_name, attrs) => ({ tagName: 'a', attribs: attrs.href && /^(?:https?:\/\/|mailto:|#)/i.test(attrs.href) ? attrs : {} }) },
  });
}

export async function getLocalDocument(root, id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('Not found');
  const relative = Buffer.from(id, 'base64url').toString('utf8');
  if (documentId(relative) !== id || !validRelative(relative)) throw new Error('Not found');
  const base = await libraryRoot(root);
  const source = await readDocumentFile(base, relative);
  const document = metadata(relative, source);
  let html;
  if (document.kind === 'json') html = `<pre><code>${escape(source)}</code></pre>`;
  else if (document.kind === 'html') html = sanitizeDocument(source);
  else {
    const index = await listLocalDocuments(root);
    const links = new Map();
    for (const item of index) {
      links.set(item.relativePath.replace(/\.[^.]+$/, ''), item.id);
      links.set(item.relativePath, item.id);
      const vaultPath = ['notes', 'private', item.relativePath].join('/');
      links.set(vaultPath, item.id);
      links.set(vaultPath.replace(/\.[^.]+$/, ''), item.id);
      const stem = path.basename(item.relativePath, path.extname(item.relativePath));
      if (!links.has(stem)) links.set(stem, item.id);
      const basename = path.basename(item.relativePath);
      if (!links.has(basename)) links.set(basename, item.id);
    }
    const markdown = source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').replace(/!?\[\[([^\]]+)\]\]/g, (_match, value) => {
      const [target, alias] = value.split('|');
      const label = alias || target;
      const rawTarget = target.split('#')[0];
      const vaultPrefix = ['notes', 'private', ''].join('/');
      const candidate = rawTarget.startsWith(vaultPrefix) ? rawTarget.slice(vaultPrefix.length) : path.posix.normalize(path.posix.join(path.posix.dirname(relative), rawTarget));
      const targetId = !candidate.startsWith('../') && candidate !== '..' ? links.get(candidate) || links.get(rawTarget) : undefined;
      return targetId ? `[${label.replace(/[\[\]<>]/g, '')}](#local-document/${targetId})` : escape(label).replace(/[\[\]]/g, '');
    });
    const renderer = new Renderer();
    renderer.html = () => '';
    html = sanitizeDocument(marked.parse(markdown, { renderer }));
  }
  const { projectPath } = await resolveProject(root);
  return { ...document, html, obsidianPath: [projectPath, 'notes', 'private', relative].filter(Boolean).join('/') };
}
