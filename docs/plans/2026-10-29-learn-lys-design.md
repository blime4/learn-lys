# Learn LYS implementation plan

The local repository is an Obsidian vault. Only explicitly approved general learning notes under `notes/public` become part of the website. Private reference documents, learner evidence and attachments stay local and are excluded from Git. Study-Mate inspires the curriculum, practice and learning-record workflow; this implementation does not embed its runtime.

## Content and build

1. Write privacy and rendering tests before implementing the generator.
2. Read only the paths listed in `site/publish.json`, require explicit public frontmatter and reject symlinks and path traversal.
3. Render Markdown, resolve public Wikilinks, drop raw HTML and unsafe URL schemes. Scan source and outputs for private material.
4. Generate a portable static website with relative assets and hash navigation, suitable for a repository Pages subpath.
5. Keep browser-local practice separate from validated learning evidence; export data for explicit local reconciliation.

## Delivery and checks

Run `npm test`, `npm run build` and `npm run check:public`. Verify desktop/mobile interactions in a real browser and independently review code before publishing. GitHub Actions deploys only `dist/`; pull requests run validation without deployment permissions.
