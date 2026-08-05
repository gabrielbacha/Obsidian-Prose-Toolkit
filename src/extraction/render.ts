import type { ExtractedHighlight } from "./parser";
import type { ProseToolkitSettings } from "../settings";

export interface RenderedHighlight {
	text: string;
	context: string;
	noteBasename: string;
}

export interface RenderedExtraction {
	markdown: string;
	highlights: RenderedHighlight[];
}

function capitalize(value: string): string {
	return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}

export function sanitizeNoteBasename(value: string): string {
	const sanitized = value
		.replace(/[\\/:*?"<>|#[\]^]/gu, "")
		.replace(/\s+/gu, " ")
		.trim();
	if (sanitized.length <= 100) return sanitized;
	return `${sanitized.slice(0, 97).trimEnd()}...`;
}

export function renderExtraction(
	extracted: ExtractedHighlight[],
	sourceBasename: string,
	settings: ProseToolkitSettings,
): RenderedExtraction {
	const highlights = extracted.map((item) => {
		const text = settings.autoCapitalize ? capitalize(item.content) : item.content;
		return {
			text,
			context: item.context,
			noteBasename: sanitizeNoteBasename(text),
		};
	});

	const renderedItems = highlights.map((item) => {
		const body = settings.createLinks
			? `[[${item.noteBasename}]]`
			: item.text;
		return settings.addFootnotes ? `${body}[^1]` : body;
	});

	const sections: string[] = [];
	const heading = settings.headlineText
		.replaceAll("$NOTE_TITLE", sourceBasename)
		.trim();
	if (heading.length > 0) sections.push(`## ${heading}`);

	if (renderedItems.length > 0) {
		sections.push(
			settings.outputFormat === "bullets"
				? renderedItems.map((item) => `- ${item}`).join("\n")
				: renderedItems.join("\n\n"),
		);
	}

	if (settings.addFootnotes && renderedItems.length > 0) {
		sections.push(`[^1]: [[${sourceBasename}]]`);
	}

	return {
		markdown: sections.length > 0 ? `${sections.join("\n\n")}\n` : "",
		highlights,
	};
}

