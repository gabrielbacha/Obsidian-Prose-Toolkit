import {
	type Editor,
	MarkdownView,
	Notice,
	Plugin,
	normalizePath,
} from "obsidian";
import { TextWorkerClient } from "./text-worker-client";
import { listPrefixLength, previousNonEmptyLine } from "./sentence/ranges";
import { registerCommands, type EditorAction } from "./commands";
import {
	coordinateExtraction,
	type ExtractionEnvironment,
} from "./extraction/coordinator";
import {
	compileSentenceRegex,
	DEFAULT_SETTINGS,
	DEFAULT_SENTENCE_REGEX,
	settingsProblem,
	normalizeSettings,
	type ProseToolkitSettings,
} from "./settings";
import { publishSettings, restoreDefaultSettings, type SettingsFiles } from "./settings-store";
import { ProseToolkitSettingTab } from "./settings-tab";

export default class ProseToolkitPlugin extends Plugin {
	settings: ProseToolkitSettings = { ...DEFAULT_SETTINGS };
	private settingsLoadProblem: string | null = null;
	private extractionQueue: Promise<void> = Promise.resolve();
	private settingsQueue: Promise<void> = Promise.resolve();
	private persistedSettings: unknown = null;
	private settingsVersion = 0;
	private alive = true;
	private textWorker = new TextWorkerClient();
	private activeExtraction: AbortController | null = null;
	private queuedExtractions = new Set<AbortController>();
	private sentencePatterns = new Map<string, RegExp>();

	async onload(): Promise<void> {
		await this.loadSettings();
		if (!this.alive) return;
		registerCommands(this);
		this.addSettingTab(new ProseToolkitSettingTab(this));
		this.addRibbonIcon("highlighter", "Extract highlights", () => {
			void this.extractActiveNote();
		});
	}

	getSentencePattern(): RegExp {
		const source = this.settings.sentenceRegexSource;
		let pattern = this.sentencePatterns.get(source);
		if (!pattern) { pattern = compileSentenceRegex(source); this.sentencePatterns.set(source, pattern); if (this.sentencePatterns.size > 8) { const oldest = Array.from(this.sentencePatterns.keys())[0]; if (oldest !== undefined) this.sentencePatterns.delete(oldest); }; }
		return pattern;
	}

	runEditorAction(editor: Editor, action: (editor: Editor) => void): void { if (this.alive) action(editor); }
	cancelTextOperation(): void { for (const controller of this.queuedExtractions) controller.abort(); this.activeExtraction?.abort(); this.textWorker.cancel(); }
	async runSentenceAction(editor: Editor, action: EditorAction, needsPrevious = false): Promise<void> {
		if (!this.alive) return;
		const cursor = editor.getCursor(), currentText = editor.getLine(cursor.line), source = this.settings.sentenceRegexSource;
		if (currentText.length > 1_000_000) { new Notice("This line is too large for sentence editing. Split it first."); return; }
		const usePrevious = needsPrevious && (cursor.ch === 0 || cursor.ch === listPrefixLength(currentText));
		const previous = usePrevious ? previousNonEmptyLine(editor, cursor.line) : cursor.line;
		const previousText = editor.getLine(previous);
		if (source === DEFAULT_SENTENCE_REGEX && currentText.length <= 4096 && previousText.length <= 4096) { action(editor, this.getSentencePattern()); return; }
		const view = this.app.workspace.getActiveViewOfType(MarkdownView), file = view?.file?.path;
		if (view?.editor !== editor) { new Notice("Open the note in a Markdown editor for this text operation."); return; }
		const anchor = editor.getCursor("anchor"), head = editor.getCursor("head");
		let until = cursor.ch;
		while (currentText[until] === " ") until++;
		try {
			const lines = [{ text: currentText, until }];
			if (usePrevious && previous !== cursor.line) lines.push({ text: previousText, until: previousText.length });
			const rows = await this.textWorker.sentences(source, lines);
			const same = (left: { line: number; ch: number }, right: { line: number; ch: number }) => left.line === right.line && left.ch === right.ch;
			if (!this.alive || this.app.workspace.getActiveViewOfType(MarkdownView) !== view || view.file?.path !== file ||
				!same(editor.getCursor("anchor"), anchor) || !same(editor.getCursor("head"), head) || editor.getLine(cursor.line) !== currentText ||
				(usePrevious && previousNonEmptyLine(editor, cursor.line) !== previous) || editor.getLine(previous) !== previousText) return;
			const ranges = new Map([[currentText, rows[0]]]);
			if (usePrevious && previous !== cursor.line) ranges.set(previousText, rows[1]);
			action(editor, { ranges });
		} catch (error) { if (this.alive) new Notice(error instanceof Error ? error.message : "Text processing failed. No editor edit was applied."); }
	}

	get settingsRecoveryReason(): string | null { return this.settingsLoadProblem; }

	private settingsPath(): string {
		return normalizePath((this.manifest.dir ?? this.app.vault.configDir + "/plugins/" + this.manifest.id) + "/data.json");
	}
	private settingsFiles(): SettingsFiles {
		const adapter = this.app.vault.adapter;
		return {
			exists: (path) => adapter.exists(path), read: (path) => adapter.read(path),
			write: (path, data) => adapter.write(path, data),
			process: (path, edit) => adapter.process(path, edit),
			copy: (source, target) => adapter.copy(source, target), remove: (path) => adapter.remove(path),
		};
	}
	async saveSettings(): Promise<void> {
		const draft = Object.freeze(normalizeSettings(this.settings));
		const files = this.settingsFiles(), path = this.settingsPath(), blocked = this.settingsLoadProblem;
		const version = ++this.settingsVersion;
		const operation = this.settingsQueue.then(async () => {
			if (blocked) throw new Error(blocked);
			const result = await publishSettings(files, path, this.persistedSettings, draft, () => this.alive);
			this.persistedSettings = result.data;
			return result;
		});
		this.settingsQueue = operation.then(() => undefined, () => undefined);
		try {
			const result = await operation;
			this.persistedSettings = result.data;
			if (this.alive && version === this.settingsVersion) this.settings = result.settings;
		} catch (error) {
			if (this.alive && version === this.settingsVersion) this.settings = normalizeSettings(this.persistedSettings);
			if (this.alive) new Notice(error instanceof Error ? error.message : "Settings were not confirmed. Check the saved recovery before retrying.");
			throw error;
		}
	}
	async snapshotSettingsRecovery(): Promise<string> { return this.settingsFiles().read(this.settingsPath()); }
	async recoverDefaultSettings(expectedRaw?: string): Promise<void> {
		const version = ++this.settingsVersion;
		const operation = this.settingsQueue.then(() => restoreDefaultSettings(this.settingsFiles(), this.settingsPath(), () => this.alive, expectedRaw));
		this.settingsQueue = operation.then(() => undefined, () => undefined);
		try {
			const result = await operation;
			this.persistedSettings = result.data; this.settingsLoadProblem = null;
			if (this.alive && version === this.settingsVersion) this.settings = result.settings;
			if (this.alive) new Notice("Default settings restored. Original data is kept in " + result.recoveryPath);
		} catch (error) {
			if (this.alive) new Notice(error instanceof Error ? error.message : "Settings recovery failed.");
			throw error;
		}
	}
	onunload(): void { this.alive = false; this.cancelTextOperation(); this.textWorker.dispose(); }

	private extractionEnvironment(): ExtractionEnvironment {
		return {
			writeClipboard: async (value) => navigator.clipboard.writeText(value),
			fileExists: async (path) =>
				this.app.vault.getAbstractFileByPath(normalizePath(path)) !== null,
			createFile: async (path, contents) => {
				await this.app.vault.create(normalizePath(path), contents);
			},
			readFile: async (path) => this.app.vault.adapter.read(normalizePath(path)),
			openFile: async (path) => {
				await this.app.workspace.openLinkText(normalizePath(path), "", true);
			},
		};
	}

	async extractActiveNote(): Promise<void> {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view?.file) {
			new Notice("Open a Markdown note before extracting highlights.");
			return;
		}

		const source = Object.freeze({ path: view.file.path, title: view.file.basename });
		const markdown = view.editor.getValue();
		const settings = Object.freeze(normalizeSettings(this.settings));
		const environment = this.extractionEnvironment();

		const controller = new AbortController(); this.queuedExtractions.add(controller);
		const operation = this.extractionQueue.then(async () => {
			if (!this.alive || controller.signal.aborted) { this.queuedExtractions.delete(controller); return null; }
			this.activeExtraction = controller;
			try {
				const highlights = await this.textWorker.extract(markdown, settings.useBoldForHighlights);
				if (controller.signal.aborted || !this.alive) return null;
				return await coordinateExtraction(markdown, source, settings, environment, { highlights, signal: controller.signal });
			} catch (error) { if (this.alive) new Notice(error instanceof Error ? error.message : "Extraction failed before file creation."); return null; }
			finally { this.queuedExtractions.delete(controller); if (this.activeExtraction === controller) this.activeExtraction = null; }
		});
		this.extractionQueue = operation.then(() => undefined, () => undefined);
		const result = await operation;
		if (!result || !this.alive) return;
		if (result.found === 0) {
			new Notice("No highlights found.");
			return;
		}

		const summary = [`Found ${result.found} highlight${result.found === 1 ? "" : "s"}`];
		if (result.cancelled) summary.push("cancelled; completed notes were kept");
		summary.push(result.clipboardCopied ? "copied to clipboard" : "clipboard copy failed");
		if (result.mainFilePath) summary.push(`created ${result.mainFilePath}${result.mainOpened ? "" : " (open it from the file list)"}`);
		if (result.mainUncertainPath) summary.push("check " + result.mainUncertainPath + " before running extraction again");
		if (settings.explodeIntoNotes) {
			summary.push(result.explodedUncertain + " not confirmed");
			summary.push(
				`${result.explodedCreated} exploded created`,
				`${result.explodedSkipped} skipped`,
			);
		}
		if (result.errors.length > 0) {
			console.error("Prose Toolkit extraction errors", result.errors);
			summary.push(`${result.errors.length} error${result.errors.length === 1 ? "" : "s"}`);
		}
		new Notice(`${summary.join("; ")}.`);
	}

	private async loadSettings(): Promise<void> {
		try {
			// Read the public adapter directly: host loadData can turn malformed JSON into null.
			const files = this.settingsFiles(), path = this.settingsPath();
			const loaded: unknown = await files.exists(path) ? JSON.parse(await files.read(path)) : null;
			this.persistedSettings = loaded;
			this.settings = normalizeSettings(loaded);
			this.settingsLoadProblem = settingsProblem(loaded);
		} catch {
			this.settings = { ...DEFAULT_SETTINGS };
			this.settingsLoadProblem = "Saved settings could not be read. The original file was not changed.";
		}
		if (this.alive && this.settingsLoadProblem) new Notice(this.settingsLoadProblem);
		// Loading is read-only. Explicit changes or confirmed recovery own later writes.
	}
}
