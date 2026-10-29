import { readFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { resolveProject, safeRelative } from './local-config.mjs';
import { listLocalDocuments, readDocumentFile } from './local-library.mjs';
import { assertPublishPath, parseNote } from './build.mjs';

const samePath = (a, b) => process.platform === 'win32' ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b);
const unavailable = reason => ({ available: false, vault: '', file: '', uri: '', reason });

async function readRegistry() {
  if (!process.env.APPDATA) return { vaults: {} };
  return JSON.parse(await readFile(path.join(process.env.APPDATA, 'obsidian', 'obsidian.json'), 'utf8'));
}

export async function resolveObsidianTarget(root, selection, dependencies = {}) {
  try {
    const location = await resolveProject(root);
    const registry = await (dependencies.readRegistry || readRegistry)();
    const entries = Object.entries(registry.vaults || {});
    const registration = location.config.vaultId ? entries.find(([id]) => id === location.config.vaultId) : entries.find(([, item]) => typeof item.path === 'string' && samePath(item.path, location.vaultRoot));
    if (!registration || typeof registration[1].path !== 'string' || !samePath(registration[1].path, location.vaultRoot)) return unavailable('尚未登记此知识库，请先在 Obsidian 打开目标仓库。');
    let relative;
    if (selection.documentId) {
      const documents = await listLocalDocuments(root);
      const source = documents.find(item => item.id === selection.documentId);
      if (!source) return unavailable('找不到这份本地资料，请刷新资料索引。');
      const mapped = location.config.documentCards?.[source.relativePath];
      relative = source.kind === 'md' ? source.relativePath : mapped || source.relativePath.replace(/\.[^.]+$/, '.md');
      if (!safeRelative(relative) || !relative.endsWith('.md') || !documents.some(item => item.relativePath === relative && item.kind === 'md')) return unavailable('这份附件没有对应的 Markdown 资料卡，请先在本地网页阅读原文。');
      relative = ['notes', 'private', relative].join('/');
    } else if (selection.lessonId) {
      const manifest = JSON.parse(await readFile(path.join(root, 'site', 'publish.json'), 'utf8'));
      if (!Array.isArray(manifest)) return unavailable('公开课程清单不可用。');
      for (const file of manifest) {
        assertPublishPath(file);
        const canonical = await readDocumentFile(location.projectRoot, file);
        if (parseNote(canonical, file).frontmatter.id === selection.lessonId) { relative = file; break; }
      }
      if (!relative) return unavailable('目标课程尚未同步到此知识库。');
    }
    if (!relative) return unavailable('请选择有效的课程或资料。');
    await readDocumentFile(location.projectRoot, relative);
    const file = [location.projectPath, relative].filter(Boolean).join('/');
    const vault = registration[0];
    const uri = `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(file)}`;
    return { available: true, vault, file, uri };
  } catch { return unavailable('知识库配置或资料暂时不可用，请检查本地设置。'); }
}

export async function launchObsidian(uri) {
  if (process.platform !== 'win32' || !process.env.LOCALAPPDATA) throw new Error('Native launcher unavailable');
  const executable = path.join(process.env.LOCALAPPDATA, 'Programs', 'obsidian', 'Obsidian.exe');
  const stat = await lstat(executable);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Native launcher unavailable');
  await new Promise((resolve, reject) => {
    const child = spawn(executable, [uri], { shell: false, windowsHide: true, stdio: 'ignore', env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}

export async function openInObsidian(root, selection, dependencies = {}) {
  const target = await resolveObsidianTarget(root, selection, dependencies);
  if (!target.available) return { status: 409, body: { error: target.reason } };
  try { await (dependencies.launch || launchObsidian)(target.uri); }
  catch { return { status: 503, body: { error: 'Obsidian 启动请求失败，请确认本机应用已安装并可运行。' } }; }
  return { status: 200, body: { launched: true, message: '已提交 Obsidian 打开请求。' } };
}
