# Prose Toolkit development

- Target: Obsidian Community Plugin written in strict TypeScript and bundled to `main.js`.
- Package manager: npm. Run `npm run check` before release work.
- Keep `src/main.ts` limited to lifecycle, settings loading, and registration delegation.
- Keep extraction self-contained and covered by black-box behavior tests.
- Sentence navigation is derived from MIT-licensed Sentence Navigator; retain `THIRD_PARTY_NOTICES.md` and attribution when changing that code.
- Use Obsidian's public `Editor`, `MarkdownView`, `Vault`, and workspace APIs. Do not depend on CodeMirror internals or Electron/Node runtime APIs.
- Never overwrite user notes. Generated-file collision behavior must stay recoverable and explicit.
- Keep command IDs and settings keys stable after the first public release.
- `main.js` is generated and release-required but is not committed to Git.
