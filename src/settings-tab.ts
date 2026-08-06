import {
	PluginSettingTab,
	type SettingDefinitionItem,
} from "obsidian";
import {
	DEFAULT_SENTENCE_REGEX,
	isValidSentenceRegex,
	type ProseToolkitSettings,
} from "./settings";

const NOTE_TITLE_TOKEN = `$${"NOTE_TITLE"}`;

type SettingKey = keyof ProseToolkitSettings;
type BooleanSettingKey = {
	[K in SettingKey]: ProseToolkitSettings[K] extends boolean ? K : never;
}[SettingKey];

const BOOLEAN_SETTING_KEYS = new Set<SettingKey>([
	"addFootnotes",
	"useBoldForHighlights",
	"createLinks",
	"autoCapitalize",
	"createNewFile",
	"explodeIntoNotes",
	"openExplodedNotes",
	"createContextualQuotes",
]);

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

	getSettingDefinitions(): SettingDefinitionItem<SettingKey>[] {
		return [
			{
				type: "group",
				heading: "Sentence navigation",
				items: [
					{
						name: "Sentence regular expression",
						desc: "Regular expression used to recognize a sentence.",
						control: {
							type: "textarea",
							key: "sentenceRegexSource",
							defaultValue: DEFAULT_SENTENCE_REGEX,
							placeholder: DEFAULT_SENTENCE_REGEX,
							rows: 3,
							validate: (value) =>
								isValidSentenceRegex(value)
									? undefined
									: "Enter a valid, non-empty regular expression.",
						},
					},
					{
						name: "Reset sentence expression",
						desc: "Restore the default sentence matching behavior.",
						action: () => {
							this.host.settings.sentenceRegexSource = DEFAULT_SENTENCE_REGEX;
							void this.host.saveSettings().then(() => this.update());
						},
					},
				],
			},
			{
				type: "group",
				heading: "Highlight extraction",
				items: [
					{
						name: "Heading text",
						desc: `Optional level-two heading. Use ${NOTE_TITLE_TOKEN} for the source note name.`,
						control: {
							type: "text",
							key: "headlineText",
							defaultValue: "",
							placeholder: `Highlights for ${NOTE_TITLE_TOKEN}`,
						},
					},
					{
						name: "Output format",
						desc: "Separate highlights as paragraphs or format them as a bullet list.",
						control: {
							type: "dropdown",
							key: "outputFormat",
							defaultValue: "paragraphs",
							options: {
								paragraphs: "Paragraphs",
								bullets: "Bullet list",
							},
						},
					},
					this.toggleDefinition(
						"Extract bold text",
						"Also treat paired **bold text** as a highlight.",
						"useBoldForHighlights",
					),
					this.toggleDefinition(
						"Add source footnotes",
						"Add a source-note footnote reference to every extracted highlight.",
						"addFootnotes",
					),
					this.toggleDefinition(
						"Auto-capitalize",
						"Capitalize the first character of each extracted highlight.",
						"autoCapitalize",
					),
					this.toggleDefinition(
						"Create links",
						"Turn each highlight into a link to a note with the same name.",
						"createLinks",
					),
					this.toggleDefinition(
						"Create highlights note",
						"Create and open a new note containing the extracted highlights.",
						"createNewFile",
					),
				],
			},
			{
				type: "group",
				heading: "Exploded notes",
				items: [
					this.toggleDefinition(
						"Create one note per highlight",
						"Create a linked note for every highlight without overwriting existing notes.",
						"explodeIntoNotes",
						() => !this.hasExplodePrerequisites(),
					),
					this.toggleDefinition(
						"Open created notes",
						"Open each exploded note after it is created.",
						"openExplodedNotes",
						() => !this.isExplodeEnabled(),
					),
					this.toggleDefinition(
						"Use contextual quotes",
						"Quote the complete source line instead of only the extracted text.",
						"createContextualQuotes",
						() => !this.isExplodeEnabled(),
					),
				],
			},
		];
	}

	getControlValue(key: string): unknown {
		return key in this.host.settings
			? this.host.settings[key as SettingKey]
			: undefined;
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (key === "sentenceRegexSource" || key === "headlineText") {
			if (typeof value !== "string") return;
			if (key === "sentenceRegexSource" && !isValidSentenceRegex(value)) return;
			this.host.settings[key] = value;
		} else if (key === "outputFormat") {
			if (value !== "paragraphs" && value !== "bullets") return;
			this.host.settings.outputFormat = value;
		} else if (BOOLEAN_SETTING_KEYS.has(key as SettingKey)) {
			if (typeof value !== "boolean") return;
			this.host.settings[key as BooleanSettingKey] = value;
		} else {
			return;
		}

		await this.host.saveSettings();
		this.update();
	}

	private toggleDefinition(
		name: string,
		desc: string,
		key: BooleanSettingKey,
		disabled?: () => boolean,
	) {
		return {
			name,
			desc,
			control: {
				type: "toggle" as const,
				key,
				defaultValue: false,
				disabled,
			},
		};
	}

	private hasExplodePrerequisites(): boolean {
		return this.host.settings.createLinks && this.host.settings.createNewFile;
	}

	private isExplodeEnabled(): boolean {
		return this.hasExplodePrerequisites() && this.host.settings.explodeIntoNotes;
	}
}
