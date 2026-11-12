export const DEFAULT_SENTENCE_REGEX = String.raw`[^.!?\s][^.!?]*(?:[.!?](?!['"]?\s|$)[^.!?]*)*[.!?]?['"]?(?=\s|$)`;

export type OutputFormat = "paragraphs" | "bullets";

export interface ProseToolkitSettings {
	sentenceRegexSource: string;
	headlineText: string;
	addFootnotes: boolean;
	useBoldForHighlights: boolean;
	createLinks: boolean;
	autoCapitalize: boolean;
	createNewFile: boolean;
	explodeIntoNotes: boolean;
	openExplodedNotes: boolean;
	createContextualQuotes: boolean;
	outputFormat: OutputFormat;
}

export const DEFAULT_SETTINGS: ProseToolkitSettings = {
	sentenceRegexSource: DEFAULT_SENTENCE_REGEX,
	headlineText: "",
	addFootnotes: false,
	useBoldForHighlights: false,
	createLinks: false,
	autoCapitalize: false,
	createNewFile: false,
	explodeIntoNotes: false,
	openExplodedNotes: false,
	createContextualQuotes: false,
	outputFormat: "paragraphs",
};

function settingsRecord(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? value as Record<string, unknown>
		: null;
}

export function settingsProblem(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	const record = settingsRecord(value);
	if (!record) return "Saved settings are not an object. The original data was not changed.";
	if (Object.prototype.hasOwnProperty.call(record, "schemaVersion") && record.schemaVersion !== 1)
		return "Saved settings use an unsupported version. The original data was not changed.";
	for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof ProseToolkitSettings>) {
		if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
		if (typeof record[key] !== typeof DEFAULT_SETTINGS[key])
			return "Some saved settings have invalid types. The original data was not changed.";
	}
	if (Object.prototype.hasOwnProperty.call(record, "outputFormat") && record.outputFormat !== "paragraphs" && record.outputFormat !== "bullets")
		return "The saved output format is invalid. The original data was not changed.";
	if (Object.prototype.hasOwnProperty.call(record, "sentenceRegexSource") && !isValidSentenceRegex(String(record.sentenceRegexSource)))
		return "The saved sentence expression is invalid. The original data was not changed.";
	return null;
}

export function normalizeSettings(value: unknown): ProseToolkitSettings {
	const merged = { ...DEFAULT_SETTINGS };
	const record = settingsRecord(value);
	if (!record || (Object.prototype.hasOwnProperty.call(record, "schemaVersion") && record.schemaVersion !== 1)) return merged;
	for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof ProseToolkitSettings>) {
		if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
		const candidate = record[key];
		if (key === "outputFormat") {
			if (candidate === "paragraphs" || candidate === "bullets") merged.outputFormat = candidate;
		} else if (key === "sentenceRegexSource") {
			if (typeof candidate === "string" && isValidSentenceRegex(candidate)) merged.sentenceRegexSource = candidate;
		} else if (key === "headlineText") {
			if (typeof candidate === "string") merged.headlineText = candidate;
		} else if (typeof candidate === "boolean") merged[key] = candidate;
	}
	if (!merged.createLinks || !merged.createNewFile) {
		merged.explodeIntoNotes = false;
		merged.openExplodedNotes = false;
	}
	if (!merged.explodeIntoNotes) merged.openExplodedNotes = false;
	return merged;
}

export function compileSentenceRegex(source: string): RegExp {
	return new RegExp(source, "gm");
}

export function isValidSentenceRegex(source: string): boolean {
	try {
		if (source.length > 4096) return false;
		compileSentenceRegex(source);
		return source.length > 0;
	} catch {
		return false;
	}
}

