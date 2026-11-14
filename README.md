# Prose Toolkit

Navigate, format, and extract prose in Obsidian without leaving your note.

<div align="center">
  <h3>Made by <a href="https://mindfulapps.xyz/?utm_source=obsidian_community&amp;utm_medium=referral&amp;utm_campaign=obsidian_assets&amp;utm_content=prose_toolkit_readme_header">Mindful Apps</a></h3>
  <p>
    <a href="https://mindfulapps.xyz/prose-toolkit/?utm_source=obsidian_community&amp;utm_medium=referral&amp;utm_campaign=obsidian_assets&amp;utm_content=prose_toolkit_readme_header"><strong>Plugin page</strong></a>
    &nbsp;·&nbsp;
    <a href="https://mindfulapps.xyz/obsidian/?utm_source=obsidian_community&amp;utm_medium=referral&amp;utm_campaign=obsidian_assets&amp;utm_content=prose_toolkit_readme_header"><strong>More Obsidian plugins</strong></a>
    &nbsp;·&nbsp;
    <a href="https://github.com/gabrielbacha/Obsidian-Prose-Toolkit/issues/new?template=feature_request.yml"><strong>Request a feature</strong></a>
  </p>
</div>

Prose Toolkit combines sentence-aware editing commands with a flexible Markdown highlight extractor. It works locally, makes no network requests, collects no telemetry, and supports desktop and mobile Obsidian.

Requires Obsidian 1.13.0 or later.

## Features

### Navigate and select prose

- Delete to the start or end of the current sentence.
- Select to the start or end of the current sentence.
- Move to the start of the current or next sentence.
- Select the current sentence or editor line.
- Customize the regular expression used to recognize sentences.

Sentence commands preserve quote, ordered-list and task prefixes. They require one selection; multiple carets are refused rather than collapsed. Small default-pattern lines stay synchronous. Custom expressions and large lines run in a local worker with a 1.5-second job deadline. Cancel text operation stops owned pending work. Changed note, line or selection state prevents a late result from editing the new target.

Sentence expressions are limited to 4,096 characters and sentence-editing lines to 1,000,000 characters. Extraction accepts notes up to 8,000,000 characters and at most 10,000 highlights, with a 32,000,000-character output budget. Limits fail explicitly; output is not silently truncated.

### Format while writing

- Toggle `==highlight==` on the current sentence.
- Toggle `**bold**` on the current sentence.
- Toggle `==**bold highlight**==` on the current sentence.
- Toggle `==**bold highlight**==` on the current editor line.

### Extract highlights

- Recognize `==highlights==`, `<mark>highlights</mark>`, attributed mark tags such as `<mark class="yellow">`, and optionally `**bold text**`.
- Copy extracted text to the clipboard as separated paragraphs or bullet items.
- Add a heading, source footnotes, links, and automatic capitalization.
- Create a highlights note without overwriting an existing note.
- Optionally create one linked note per highlight with source or contextual quotes.

## Saved settings recovery

Loading validates saved settings without rewriting them. Explicit changes preserve independent updates from another vault instance and refuse overlapping edits. A verified recovery file is prepared before publication. Invalid or unsupported settings remain unchanged until you confirm Restore default settings; recovery checks that the selected original has not changed. Recovery files stay in the actual plugin folder.

## Default shortcuts

| Action | Shortcut |
| --- | --- |
| Extract highlights | None |
| Toggle sentence highlight | `Mod+Shift+E` |
| Toggle sentence bold | `Mod+Shift+B` |
| Toggle sentence bold highlight | `Mod+Shift+R` |
| Toggle line bold highlight | `Mod+Shift+P` |
| Delete to sentence start | `Mod+Shift+Backspace` |
| Delete to sentence end | `Mod+Shift+Delete` |
| Select current sentence | `Mod+R` |
| Select current line | `Mod+G` |

`Mod` means Command on macOS and Ctrl on Windows or Linux. Every shortcut can be changed under **Settings → Hotkeys**.

## Extraction behavior

Run **Prose Toolkit: Extract highlights** in a Markdown note. Prose attempts to copy each result to the clipboard and reports a failed copy separately. Settings can additionally create `Highlights for <note>.md` and exploded highlight notes.

Each extraction captures the source path, editor text, and settings before asynchronous work starts. Summary and exploded notes link to that full source path, so notes with the same name in different folders keep their own attribution. A changed setting does not alter an extraction already in progress.

Code fences, indented and inline code, frontmatter, HTML comments, and HTML attributes are excluded from extraction. Explicit mark contents and ordinary prose remain eligible. Delimiters cannot pair across separate paragraphs, list items, or code blocks. Nested bold inside a highlight keeps its existing precedence.

Note creation and opening are reported separately. A failed attempt to open a created note does not stop the remaining requested notes. An unconfirmed creation reports the target to check before retrying; it does not create another summary automatically.

Prose Toolkit never overwrites a note:

- A conflicting highlights note receives a numbered name.
- A conflicting exploded note is skipped and included in the completion notice.

## Installation

### Community plugins

After approval, install **Prose Toolkit** from **Settings → Community plugins → Browse**.

### Manual installation

Copy `main.js`, `manifest.json`, and `styles.css` if present into:

```text
<vault>/.obsidian/plugins/prose-toolkit/
```

Reload Obsidian and enable **Prose Toolkit**.

## Development

```bash
npm install
npm run dev
npm run check
```

The bundle embeds the complete third-party notice. Release validation checks the built JavaScript, embedded notice, and exact tag/manifest version match before publication. Release tags must exactly match the version in `manifest.json`. Attach `main.js`, `manifest.json`, and optional `styles.css` to each GitHub release.

The optional `npm run test:native` check launches the installed desktop app with a generated profile and vault. Set `OBSIDIAN_EXECUTABLE` to the app executable, `OBSIDIAN_ASAR` to the installed app bundle when required, and `PROSE_TOOLKIT_PLAYWRIGHT_PACKAGE` to a package.json with Playwright installed. The check proves the generated profile, vault, plugin identity and bundle hashes before editor actions, then closes and removes only its fixture.

Native checks cover public editor selection, formatting, whitespace, undo and multiple-carets refusal; source-link identity; generated notes; adapter conflicts and settings recovery; and a rendered setting control. Extraction uses a fixture clipboard callback. System clipboard, physical mobile input and personal-profile acceptance remain separate checks.

## Privacy and security

- No telemetry or analytics.
- No network requests.
- No remote code loading.
- Vault access is limited to the active note and notes explicitly generated by the user.
- Clipboard access occurs only when the extraction command is run.

## License

MIT. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

---

<div align="center">
  <h3>Made by <a href="https://mindfulapps.xyz/?utm_source=obsidian_community&amp;utm_medium=referral&amp;utm_campaign=obsidian_assets&amp;utm_content=prose_toolkit_readme_footer">Mindful Apps</a></h3>
  <p>
    <a href="https://mindfulapps.xyz/prose-toolkit/?utm_source=obsidian_community&amp;utm_medium=referral&amp;utm_campaign=obsidian_assets&amp;utm_content=prose_toolkit_readme_footer"><strong>Plugin page</strong></a>
    &nbsp;·&nbsp;
    <a href="https://mindfulapps.xyz/obsidian/?utm_source=obsidian_community&amp;utm_medium=referral&amp;utm_campaign=obsidian_assets&amp;utm_content=prose_toolkit_readme_footer"><strong>More Obsidian plugins</strong></a>
    &nbsp;·&nbsp;
    <a href="https://github.com/gabrielbacha/Obsidian-Prose-Toolkit/issues/new?template=feature_request.yml"><strong>Request a feature</strong></a>
  </p>
</div>
