import assert from 'node:assert/strict';
import { launchObsidian, openLivePreview } from './obsidian-harness.mjs';

const original = '> - [ ] First sentence.  Second sentence!\n\nPlain fixture.';
const host = await launchObsidian({ files: { 'A/Shared.md': original, 'B/Shared.md': 'Other synthetic note.' }, pluginFolder: 'prose-fixture' });
try {
 const { page } = host;
 await openLivePreview(page, 'A/Shared.md');
 const report = await page.evaluate(async original => {
  const app = window.app, plugin = app.plugins.getPlugin('prose-toolkit');
  const view = app.workspace.activeLeaf.view, editor = view.editor;
  const command = name => app.commands.commands['prose-toolkit:' + name].editorCallback(editor, view);
  const point = ch => ({ line: 0, ch });
  const reset = () => { editor.setValue(original); editor.setCursor(point(11)); };
  const result = { commands: Object.keys(app.commands.commands).filter(x => x.startsWith('prose-toolkit:')).length };
  reset();
  editor.setSelection(point(20), point(11));
  await command('shortcut-bold-highlight-sentence');
  result.combined = { value: editor.getValue(), anchor: editor.getCursor('anchor'), head: editor.getCursor('head') };
  await command('shortcut-bold-highlight-sentence');
  result.restored = { value: editor.getValue(), anchor: editor.getCursor('anchor'), head: editor.getCursor('head') };
  reset();
  await new Promise(resolve => window.setTimeout(resolve, 750));
  await command('forward-delete-sentence'); result.deleted = editor.getValue();
  editor.undo(); result.undo = editor.getValue();
  reset();
  editor.setSelections([{ anchor: point(9), head: point(9) }, { anchor: point(30), head: point(30) }]);
  await command('shortcut-highlight-sentence'); result.multi = { value: editor.getValue(), selections: editor.listSelections().length };
  reset(); await command('select-sentence'); result.selection = editor.getSelection();
  editor.setCursor(point(0)); await command('move-start-current-sentence'); result.firstStart = editor.getCursor();
  // Override only the owned plugin's environment before extraction.
  // No navigator clipboard getter or system clipboard API is called.
  const createEnvironment = plugin.extractionEnvironment.bind(plugin);
  let copied = '';
  plugin.extractionEnvironment = () => ({ ...createEnvironment(), writeClipboard: async text => { copied = text; } });
  try {
   editor.setValue('Paragraph ==one== and <mark>two</mark>.');
   plugin.settings = { ...plugin.settings, createLinks: true, createNewFile: true, explodeIntoNotes: false };
   await plugin.extractActiveNote();
   result.clipboardCallback = copied;
   result.created = [];
   for (const file of app.vault.getMarkdownFiles()) if (!['A/Shared.md', 'B/Shared.md'].includes(file.path)) result.created.push({ path: file.path, text: await app.vault.read(file) });
   result.sourceResolved = app.metadataCache.getFirstLinkpathDest('A/Shared.md', '')?.path;
  } finally { plugin.extractionEnvironment = createEnvironment; }
  result.settingsPath = plugin.manifest.dir + '/data.json';
  await plugin.saveSettings();
  result.settings = JSON.parse(await app.vault.adapter.read(result.settingsPath));
  result.focus = editor.hasFocus();
  return result;
 }, original);
 console.log('Native observations:', JSON.stringify(report));
 assert.equal(report.commands, 14);
 assert.equal(report.combined.value, '> - [ ] ==**First sentence.**==  Second sentence!\n\nPlain fixture.');
 assert.deepEqual(report.combined.anchor, { line: 0, ch: 24 }); assert.deepEqual(report.combined.head, { line: 0, ch: 15 });
 assert.equal(report.restored.value, original); assert.deepEqual(report.restored.anchor, { line: 0, ch: 20 }); assert.deepEqual(report.restored.head, { line: 0, ch: 11 });
 assert.notEqual(report.deleted, original); assert.equal(report.undo, original);
 assert.equal(report.multi.value, original); assert.equal(report.multi.selections, 2);
 assert.equal(report.selection, 'First sentence.'); assert.deepEqual(report.firstStart, { line: 0, ch: 8 });
 assert.equal(report.created.length, 1); assert.match(report.created[0].text, /A\/Shared\.md/); assert.equal(report.sourceResolved, 'A/Shared.md');
 assert.match(report.clipboardCallback, /one/); assert.match(report.clipboardCallback, /two/);
 assert.equal(report.settingsPath, '.obsidian/plugins/prose-fixture/data.json'); assert.equal(report.settings.createLinks, true);
 assert.deepEqual(host.errors, []);
 const atomic = await page.evaluate(async () => {
  const app = window.app, plugin = app.plugins.getPlugin('prose-toolkit'), adapter = app.vault.adapter;
  const path = plugin.manifest.dir + '/data.json';
  const originalRead = adapter.read.bind(adapter);
  let release, started, held = false;
  const start = new Promise(resolve => { started = resolve; });
  const barrier = new Promise(resolve => { release = resolve; });
  adapter.read = async target => { const text = await originalRead(target); if (target === path && !held) { held = true; started(); await barrier; } return text; };
  plugin.settings.headlineText = 'Native draft';
  const saving = plugin.saveSettings(); await start;
  await adapter.process(path, text => { const value = JSON.parse(text); value.outputFormat = 'bullets'; value.futureFixture = 'keep'; return JSON.stringify(value); });
  release(); await saving; adapter.read = originalRead;
  const merged = JSON.parse(await adapter.read(path));
  plugin.settings.headlineText = 'Conflicting draft';
  await adapter.process(path, text => { const value = JSON.parse(text); value.headlineText = 'Other writer'; return JSON.stringify(value); });
  let refused = false; try { await plugin.saveSettings(); } catch { refused = true; }
  const conflicted = JSON.parse(await adapter.read(path));
  const malformed = '{invalid generated settings'; await adapter.write(path, malformed);
  await app.plugins.disablePlugin('prose-toolkit'); await app.plugins.enablePlugin('prose-toolkit');
  const loaded = app.plugins.getPlugin('prose-toolkit');
  const unchanged = await adapter.read(path) === malformed;
  const expected = await loaded.snapshotSettingsRecovery();
  await loaded.recoverDefaultSettings(expected);
  const restored = JSON.parse(await adapter.read(path));
  const files = await adapter.list(loaded.manifest.dir);
  let originalRecovered = false;
  for (const file of files.files) if (file.includes('recovery') && JSON.parse(await adapter.read(file)).original === malformed) originalRecovered = true;
  return { merged, refused, conflicted, unchanged, originalRecovered, restored };
 });
 console.log('Native atomic observations:', JSON.stringify(atomic));
 assert.equal(atomic.merged.headlineText, 'Native draft'); assert.equal(atomic.merged.outputFormat, 'bullets'); assert.equal(atomic.merged.futureFixture, 'keep');
 assert.equal(atomic.refused, true); assert.equal(atomic.conflicted.headlineText, 'Other writer');
 assert.equal(atomic.unchanged, true); assert.equal(atomic.originalRecovered, true); assert.equal(atomic.restored.schemaVersion, 1);
 console.log('PASS native adapter: independent concurrent edit merged, conflicting key refused, invalid load untouched, exact original recovery retained.');
 await page.evaluate(() => { window.app.setting.open(); window.app.setting.openTabById('prose-toolkit'); });
 let ui;
 for (let attempt = 0; attempt < 100 && !ui; attempt++) {
  for (const candidate of page.context().pages()) if (await candidate.getByText('Heading text', { exact: true }).count()) { ui = candidate; break; }
  if (!ui) await new Promise(resolve => setTimeout(resolve, 100));
 }
 if (!ui) throw new Error('Prose settings did not open in the owned native context.');
 const row = ui.locator('.setting-item').filter({ has: ui.getByText('Heading text', { exact: true }) });
 const heading = row.locator('input'); await heading.fill('Native control draft'); await heading.press('Tab');
 await page.waitForFunction(async () => {
  const plugin = window.app.plugins.getPlugin('prose-toolkit');
  return JSON.parse(await window.app.vault.adapter.read(plugin.manifest.dir + '/data.json')).headlineText === 'Native control draft';
 });
 console.log('PASS native rendered heading control publishes its typed value.');
 assert.deepEqual(host.errors, []);
 console.log('PASS native public Editor: reverse selections, four-character wrapper cursor, whitespace, undo, multi-cursor refusal, prefix start, retained commands.');
 console.log('PASS native Vault: exact source link, new file, clipboard callback with system clipboard untouched, alternate manifest-dir settings.');
 console.log(JSON.stringify(report));
} finally { await host.close(); }
