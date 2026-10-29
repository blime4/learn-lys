import { readFile, writeFile, mkdir, rm, lstat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { marked, Renderer } from 'marked';
import { parse as parseYaml } from 'yaml';
import sanitizeHtml from 'sanitize-html';

export function assertPublishPath(file) {
  if (typeof file !== 'string' || !/^notes\/public\/(?:[\p{L}\p{N}_-]+\/)*[\p{L}\p{N}_. -]+\.md$/u.test(file) || file.split('/').includes('..')) {
    throw new Error(`Invalid publish path: ${file}`);
  }
  return file;
}

export function assertPublicContent(text, { code = false, sourceDocumentation = false } = {}) {
  const blocked = [
    /(?:[a-z0-9-]+\.)*(?:denglin\.com|feishu\.cn)\b/i,
    /\b[a-z]:[\\/]+/i,
    /\b(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})\b/,
    /(?:notes[\\/]private|\.reference[\\/]|learning-state\.json|file:\/\/)/i,
    /\b(?:HBM3e|SIMT64|STUEXEC\.MPI|taishan_isa|DLLINK|DLGPUXHKPInstrInfo|192\s*GB|96\s*GB)\b/i,
    /LYS\s+chip\s+spec/i,
  ];
  const patterns = (code ? blocked.slice(0, 4) : blocked).filter((_, index) => !(sourceDocumentation && index === 3));
  if (sourceDocumentation && /notes[\\/]private[\\/][^\s`"'<>]+/i.test(text)) throw new Error('Public content contains a private attachment path');
  if (patterns.some(pattern => pattern.test(text)) || (code && /\b(?:192\s*GB|96\s*GB|48\s*CE)\b/i.test(text))) {
    throw new Error('Public content contains a private source, address, or specification');
  }
}

export function assertTrackedPaths(files, publishPaths = []) {
  const allowed = /^(?:(?:scripts|tests|docs|\.github)\/|site\/(?:index\.html|app\.js|styles\.css|favicon\.svg|site\.json|publish\.json)$|(?:package(?:-lock)?\.json|README(?:\.[\w-]+)?\.md|LICENSE|NOTICE|\.gitignore|\.gitattributes|AGENTS\.md)$)/;
  for (const file of files) {
    const approvedNote = publishPaths.includes(file) && file.startsWith('notes/public/');
    if ((!allowed.test(file) && !approvedNote) || /(?:^|\/)(?:private|raw|\.obsidian)(?:\/|$)/.test(file)) {
      throw new Error(`Private tracked path: ${file}`);
    }
  }
}

export function renderNote(body, noteIds) {
  const source = body.replace(/!?\[\[([^\]]+)\]\]/g, (_match, reference) => {
    const [target, alias] = reference.split('|');
    const [note, heading] = target.split('#');
    const id = noteIds.get(note.replace(/\.md$/, ''));
    if (!id) return '未发布笔记';
    const label = (alias || heading || note).replace(/[\[\]<>]/g, '');
    return `[${label}](#lesson/${id})`;
  });
  const renderer = new Renderer();
  renderer.html = () => '';
  const rendered = marked.parse(source, { renderer });
  return sanitizeHtml(rendered, {
    allowedTags: ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'strong', 'em', 'del', 'hr', 'br', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a', 'input'],
    allowedAttributes: { a: ['href', 'title'], code: ['class'], input: ['type', 'checked', 'disabled'] },
    allowedSchemes: ['https', 'http', 'mailto'],
    allowProtocolRelative: false,
    transformTags: {
      input: () => ({ tagName: 'input', attribs: { type: 'checkbox', disabled: 'disabled' } }),
      a: (_tag, attrs) => ({ tagName: 'a', attribs: attrs.href && /^(?:https?:\/\/|mailto:|#)/i.test(attrs.href) ? attrs : {} }),
    },
  });
}

async function noSymlinks(root, relative) {
  let cursor = root;
  for (const part of relative.split('/')) {
    cursor = path.join(cursor, part);
    if ((await lstat(cursor)).isSymbolicLink()) throw new Error(`Publish symlink is not allowed: ${relative}`);
  }
}

export function parseNote(text, file) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
  if (!match) throw new Error(`Missing frontmatter: ${file}`);
  const frontmatter = parseYaml(match[1]);
  if (frontmatter?.publish !== true || frontmatter?.visibility !== 'public') throw new Error(`Note must be explicitly public: ${file}`);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(frontmatter.id || '') || typeof frontmatter.title !== 'string' || !frontmatter.title.trim()) throw new Error(`Invalid note id or title: ${file}`);
  const invalid = field => { throw new Error(`Invalid ${field} property: ${file}`); };
  if (frontmatter.tags !== undefined && (!Array.isArray(frontmatter.tags) || frontmatter.tags.some(tag => typeof tag !== 'string' || !tag.trim()))) invalid('tags');
  for (const field of ['week', 'minutes']) {
    const value = frontmatter[field];
    if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || (field === 'week' && !Number.isInteger(value)))) invalid(field);
  }
  if (frontmatter.summary !== undefined && typeof frontmatter.summary !== 'string') invalid('summary');
  if (frontmatter.kind !== undefined && !['概念', '实操', '实验'].includes(frontmatter.kind)) invalid('kind');
  if (frontmatter.status !== undefined && !['未开始', '学习中', '已练习', '已验证'].includes(frontmatter.status)) invalid('status');
  return { frontmatter, body: match[2], file };
}

export async function build(root = process.cwd()) {
  root = path.resolve(root);
  const manifest = JSON.parse(await readFile(path.join(root, 'site/publish.json'), 'utf8'));
  if (!Array.isArray(manifest) || new Set(manifest).size !== manifest.length) throw new Error('Publish manifest must be an array of unique paths');
  const notes = [];
  for (const file of manifest) {
    assertPublishPath(file);
    await noSymlinks(root, file);
    const text = await readFile(path.join(root, file), 'utf8');
    // Check the original source as well as rendered output; hidden comments cannot bypass the gate.
    assertPublicContent(text);
    notes.push(parseNote(text, file));
  }
  const ids = new Map();
  for (const note of notes) {
    const { id } = note.frontmatter;
    if (ids.has(id)) throw new Error(`Duplicate lesson id: ${id}`);
    ids.set(id, id);
    for (const key of [path.basename(note.file, '.md'), note.file.replace(/\.md$/, '')]) ids.set(key, id);
  }
  const base = JSON.parse(await readFile(path.join(root, 'site/site.json'), 'utf8'));
  const data = {
    meta: base.meta || {},
    lessons: notes.map(({ frontmatter: f, body, file }) => {
      const html = renderNote(body, ids);
      const links = [...html.matchAll(/href="#lesson\/([a-z0-9-]+)"/g)].map(match => match[1]);
      return { id: f.id, title: f.title, summary: f.summary || '', kind: f.kind || '概念', week: f.week || 1, status: f.status || '未开始', minutes: f.minutes || 15, tags: f.tags || [], path: file, html, links: [...new Set(links)] };
    }),
    roadmap: base.roadmap || [], references: base.references || [], glossary: base.glossary || [],
  };
  const outputs = new Map([['data.json', JSON.stringify(data, null, 2)], ['.nojekyll', '']]);
  for (const file of ['index.html', 'app.js', 'styles.css', 'favicon.svg']) {
    if (file === 'favicon.svg') {
      try { await lstat(path.join(root, 'site', file)); }
      catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    }
    await noSymlinks(root, `site/${file}`);
    outputs.set(file, await readFile(path.join(root, 'site', file), 'utf8'));
  }
  for (const value of outputs.values()) assertPublicContent(value);
  const dist = path.join(root, 'dist');
  try { if ((await lstat(dist)).isSymbolicLink()) throw new Error('Output directory cannot be a symlink'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });
  for (const [file, content] of outputs) await writeFile(path.join(dist, file), content);
  return data;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const data = await build();
  process.stdout.write(`Built ${data.lessons.length} curated public lessons into dist/\n`);
}
