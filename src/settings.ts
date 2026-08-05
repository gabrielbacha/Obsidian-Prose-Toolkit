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

export function normalizeSettings(
	value: Partial<ProseToolkitSettings> | null | undefined,
): ProseToolkitSettings {
	const merged = { ...DEFAULT_SETTINGS, ...(value ?? {}) };
	if (merged.outputFormat !== "paragraphs" && merged.outputFormat !== "bullets") {
		merged.outputFormat = DEFAULT_SETTINGS.outputFormat;
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
		compileSentenceRegex(source);
		return source.length > 0;
	} catch {
		return false;
	}
}

