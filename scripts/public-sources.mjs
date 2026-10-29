import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { assertPublicContent, assertTrackedPaths, assertPublishPath, parseNote } from './build.mjs';

function scrubSyntheticFixtures(text) {
  // These are deliberate test fixtures and policy identifiers, never real document locations.
  return text
    .replace(/https:\/\/fixture\.(?:denglin\.com|feishu\.cn)\/example/g, 'https://example.test/example')
    .replace(/http:\/\/10\.200\.100\.50\/example/g, 'https://example.test/example')
    .replace(/[CD]:[\\/]+(?:Users[\\/]+fixture[\\/]+example|workspace[\\/]+example|study[\\/]+example|a\.md)/g, 'example-path')
    .replace(/notes\/private\/(?:example\.md|a\.md|foo\.md|secret)/g, 'example-note')
    .replace(/notes\/private\/(?=[`'"])/g, 'private-directory')
    .replace(/learning-state\.json/g, 'private-state-identifier');
}

export async function checkTrackedSources(root, files, readSource = file => readFile(path.join(root, file), 'utf8')) {
  const manifest = JSON.parse(await readSource('site/publish.json'));
  if (!Array.isArray(manifest) || new Set(manifest).size !== manifest.length) throw new Error('Invalid publish manifest');
  manifest.forEach(assertPublishPath);
  assertTrackedPaths(files, manifest);
  for (const file of files) {
    try {
      const text = await readSource(file);
      if (file.startsWith('notes/public/')) parseNote(text, file);
      if (/^(?:scripts|tests)\//.test(file)) assertPublicContent(scrubSyntheticFixtures(text), { code: true });
      else if (/^(?:docs\/|README|AGENTS\.md$)/.test(file)) assertPublicContent(text, { sourceDocumentation: true });
      else if (/^(?:notes\/public\/|site\/)/.test(file)) assertPublicContent(text);
    } catch (error) { throw new Error(`${error.message} (${file})`, { cause: error }); }
  }
}
