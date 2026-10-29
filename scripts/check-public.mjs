import { execFileSync } from 'node:child_process';
import { readFile, readdir, lstat } from 'node:fs/promises';
import path from 'node:path';
import { assertPublicContent } from './build.mjs';
import { checkTrackedSources } from './public-sources.mjs';

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
await checkTrackedSources(process.cwd(), tracked, async file => {
  if (!tracked.length) return readFile(file, 'utf8');
  return execFileSync('git', ['show', `:${file}`], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
});
async function scan(directory) {
  for (const file of await readdir(directory)) {
    const full = path.join(directory, file);
    const stat = await lstat(full);
    if (stat.isSymbolicLink()) throw new Error('Public output must not contain symlinks');
    if (stat.isDirectory()) await scan(full);
    else assertPublicContent(await readFile(full, 'utf8'));
  }
}
await scan('dist');
process.stdout.write(`Public gate passed: ${tracked.length} tracked/staged files and dist/ checked\n`);
