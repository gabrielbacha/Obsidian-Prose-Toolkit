import {
	MarkdownView,
	Notice,
	Plugin,
	normalizePath,
} from "obsidian";
import { registerCommands } from "./commands";
import {
	coordinateExtraction,
	type ExtractionEnvironment,
} from "./extraction/coordinator";
import {
	compileSentenceRegex,
	DEFAULT_SETTINGS,
	isValidSentenceRegex,
	normalizeSettings,
	type ProseToolkitSettings,
} from "./settings";
import { ProseToolkitSettingTab } from "./settings-tab";

export default class ProseToolkitPlugin extends Plugin {
	settings: ProseToolkitSettings = { ...DEFAULT_SETTINGS };

	async onload(): Promise<void> {
		await this.loadSettings();
		registerCommands(this);
		this.addSettingTab(new ProseToolkitSettingTab(this));
		this.addRibbonIcon("highlighter", "Extract highlights", () => {
			void this.extractActiveNote();
		});
	}

	getSentencePattern(): RegExp {
		return compileSentenceRegex(this.settings.sentenceRegexSource);
	}

	async saveSettings(): Promise<void> {
		this.settings = normalizeSettings(this.settings);
		await this.saveData(this.settings);
	}

	async extractActiveNote(): Promise<void> {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view?.file) {
			new Notice("Open a Markdown note before extracting highlights.");
			return;
		}

		const environment: ExtractionEnvironment = {
			writeClipboard: async (value) => navigator.clipboard.writeText(value),
			fileExists: async (path) =>
				this.app.vault.getAbstractFileByPath(normalizePath(path)) !== null,
			createFile: async (path, contents) => {
				await this.app.vault.create(normalizePath(path), contents);
			},
			openFile: async (path) => {
				await this.app.workspace.openLinkText(normalizePath(path), "", true);
			},
		};

		const result = await coordinateExtraction(
			view.editor.getValue(),
			view.file.basename,
			this.settings,
			environment,
		);
		if (result.found === 0) {
			new Notice("No highlights found.");
			return;
		}

		const summary = [`Found ${result.found} highlight${result.found === 1 ? "" : "s"}`];
		summary.push(result.clipboardCopied ? "copied to clipboard" : "clipboard copy failed");
		if (result.mainFilePath) summary.push(`created ${result.mainFilePath}`);
		if (this.settings.explodeIntoNotes) {
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
		const loaded = (await this.loadData()) as Partial<ProseToolkitSettings> | null;
		this.settings = normalizeSettings(loaded);
		if (!isValidSentenceRegex(this.settings.sentenceRegexSource)) {
			this.settings.sentenceRegexSource = DEFAULT_SETTINGS.sentenceRegexSource;
		}
		await this.saveData(this.settings);
	}
}
