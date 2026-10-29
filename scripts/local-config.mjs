import { readFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';

export function safeRelative(value) {
  return typeof value === 'string' && value.length > 0 && !path.isAbsolute(value) && !/[\\:\0]/.test(value) && value.split('/').every(part => part && part !== '.' && part !== '..');
}

export async function secureDirectory(directory) {
  const absolute = path.resolve(directory);
  const parsed = path.parse(absolute);
  let current = parsed.root;
  for (const part of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const stat = await lstat(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Knowledge folder unavailable');
  }
  return realpath(absolute);
}

export async function resolveProject(root) {
  root = await secureDirectory(root);
  let config;
  try {
    await secureDirectory(path.join(root, '.local'));
    const file = path.join(root, '.local', 'obsidian.json');
    const stat = await lstat(file);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size > 64 * 1024) throw new Error('Invalid local knowledge configuration');
    config = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!config) return { vaultRoot: root, projectRoot: root, projectPath: '', config: {} };
  if (!path.isAbsolute(config.vaultPath || '') || !safeRelative(config.projectPath) || (config.vaultId !== undefined && typeof config.vaultId !== 'string')) throw new Error('Invalid local knowledge configuration');
  const vaultRoot = await secureDirectory(config.vaultPath);
  const projectRoot = await secureDirectory(path.join(vaultRoot, ...config.projectPath.split('/')));
  const relative = path.relative(vaultRoot, projectRoot);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Invalid local knowledge configuration');
  return { vaultRoot, projectRoot, projectPath: config.projectPath, config };
}
