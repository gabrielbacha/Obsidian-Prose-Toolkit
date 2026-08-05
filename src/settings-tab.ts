import { Notice, PluginSettingTab, Setting } from "obsidian";
import {
	DEFAULT_SENTENCE_REGEX,
	isValidSentenceRegex,
	type ProseToolkitSettings,
} from "./settings";

const NOTE_TITLE_TOKEN = `$${"NOTE_TITLE"}`;

export interface SettingsHost {
	app: PluginSettingTab["app"];
	settings: ProseToolkitSettings;
	saveSettings(): Promise<void>;
}

export class ProseToolkitSettingTab extends PluginSettingTab {
	private readonly host: SettingsHost;

	constructor(host: SettingsHost) {
		super(host.app, host as never);
		this.host = host;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		new Setting(containerEl).setName("Sentence navigation").setHeading();

		const regexSetting = new Setting(containerEl)
			.setName("Sentence regular expression")
			.setDesc("Regular expression used to recognize a sentence.")
			.addTextArea((textArea) => {
				textArea
					.setPlaceholder(DEFAULT_SENTENCE_REGEX)
					.setValue(this.host.settings.sentenceRegexSource)
					.onChange(async (value) => {
						if (!isValidSentenceRegex(value)) {
							new Notice("Sentence regular expression is invalid.");
							return;
						}
						this.host.settings.sentenceRegexSource = value;
						await this.host.saveSettings();
					});
				textArea.inputEl.rows = 3;
			});

		new Setting(containerEl)
			.setName("Reset sentence expression")
			.setDesc("Restore the default sentence matching behavior.")
			.addButton((button) =>
				button.setButtonText("Reset").onClick(async () => {
					this.host.settings.sentenceRegexSource = DEFAULT_SENTENCE_REGEX;
					const component = regexSetting.components[0];
					if (component && "setValue" in component) {
						(component as { setValue(value: string): unknown }).setValue(
							DEFAULT_SENTENCE_REGEX,
						);
					}
					await this.host.saveSettings();
				}),
			);

		new Setting(containerEl).setName("Highlight extraction").setHeading();

		new Setting(containerEl)
			.setName("Heading text")
			.setDesc(
				`Optional level-two heading. Use ${NOTE_TITLE_TOKEN} for the source note name.`,
			)
			.addText((text) =>
				text
					.setPlaceholder(`Highlights for ${NOTE_TITLE_TOKEN}`)
					.setValue(this.host.settings.headlineText)
					.onChange(async (value) => {
						this.host.settings.headlineText = value;
						await this.host.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Output format")
			.setDesc("Separate highlights as paragraphs or format them as a bullet list.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("paragraphs", "Paragraphs")
					.addOption("bullets", "Bullet list")
					.setValue(this.host.settings.outputFormat)
					.onChange(async (value) => {
						this.host.settings.outputFormat =
							value === "bullets" ? "bullets" : "paragraphs";
						await this.host.saveSettings();
					}),
			);

		this.addToggle(
			"Extract bold text",
			"Also treat paired **bold text** as a highlight.",
			"useBoldForHighlights",
		);
		this.addToggle(
			"Add source footnotes",
			"Add a source-note footnote reference to every extracted highlight.",
			"addFootnotes",
		);
		this.addToggle(
			"Auto-capitalize",
			"Capitalize the first character of each extracted highlight.",
			"autoCapitalize",
		);
		this.addToggle(
			"Create links",
			"Turn each highlight into a link to a note with the same name.",
			"createLinks",
			true,
		);
		this.addToggle(
			"Create highlights note",
			"Create and open a new note containing the extracted highlights.",
			"createNewFile",
			true,
		);

		new Setting(containerEl).setName("Exploded notes").setHeading();
		const prerequisites =
			this.host.settings.createLinks && this.host.settings.createNewFile;
		const explode = new Setting(containerEl)
			.setName("Create one note per highlight")
			.setDesc(
				prerequisites
					? "Create a linked note for every highlight without overwriting existing notes."
					: "Enable both Create links and Create highlights note first.",
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.host.settings.explodeIntoNotes)
					.setDisabled(!prerequisites)
					.onChange(async (value) => {
						this.host.settings.explodeIntoNotes = value;
						if (!value) this.host.settings.openExplodedNotes = false;
						await this.host.saveSettings();
						this.display();
					});
			});
		if (!prerequisites) explode.setDisabled(true);

		const explodeEnabled = prerequisites && this.host.settings.explodeIntoNotes;
		this.addToggle(
			"Open created notes",
			"Open each exploded note after it is created.",
			"openExplodedNotes",
			false,
			!explodeEnabled,
		);
		this.addToggle(
			"Use contextual quotes",
			"Quote the complete source line instead of only the extracted text.",
			"createContextualQuotes",
			false,
			!explodeEnabled,
		);
	}

	private addToggle(
		name: string,
		description: string,
		key: keyof Pick<
			ProseToolkitSettings,
			| "useBoldForHighlights"
			| "addFootnotes"
			| "autoCapitalize"
			| "createLinks"
			| "createNewFile"
			| "openExplodedNotes"
			| "createContextualQuotes"
		>,
		rerender = false,
		disabled = false,
	): void {
		new Setting(this.containerEl)
			.setName(name)
			.setDesc(description)
			.addToggle((toggle) =>
				toggle
					.setValue(this.host.settings[key])
					.setDisabled(disabled)
					.onChange(async (value) => {
						this.host.settings[key] = value;
						if (
							(key === "createLinks" || key === "createNewFile") &&
							!value
						) {
							this.host.settings.explodeIntoNotes = false;
							this.host.settings.openExplodedNotes = false;
						}
						await this.host.saveSettings();
						if (rerender) this.display();
					}),
			);
	}
}
