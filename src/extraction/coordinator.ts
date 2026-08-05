import type { ProseToolkitSettings } from "../settings";
import { extractHighlights } from "./parser";
import { renderExtraction } from "./render";

export interface ExtractionEnvironment {
	writeClipboard(value: string): Promise<void>;
	fileExists(path: string): Promise<boolean>;
	createFile(path: string, contents: string): Promise<void>;
	openFile(path: string): Promise<void>;
}

export interface ExtractionResult {
	found: number;
	clipboardCopied: boolean;
	mainFilePath: string | null;
	explodedCreated: number;
	explodedSkipped: number;
	explodedFailed: number;
	errors: string[];
	markdown: string;
}

function markdownPath(basename: string): string {
	return basename.toLowerCase().endsWith(".md") ? basename : `${basename}.md`;
}

async function availableMainPath(
	basePath: string,
	environment: ExtractionEnvironment,
): Promise<string> {
	if (!(await environment.fileExists(basePath))) return basePath;
	const stem = basePath.slice(0, -3);
	let suffix = 2;
	while (await environment.fileExists(`${stem} ${suffix}.md`)) suffix += 1;
	return `${stem} ${suffix}.md`;
}

export async function coordinateExtraction(
	markdown: string,
	sourceBasename: string,
	settings: ProseToolkitSettings,
	environment: ExtractionEnvironment,
): Promise<ExtractionResult> {
	const parsed = extractHighlights(markdown, settings.useBoldForHighlights);
	const rendered = renderExtraction(parsed, sourceBasename, settings);
	const result: ExtractionResult = {
		found: parsed.length,
		clipboardCopied: false,
		mainFilePath: null,
		explodedCreated: 0,
		explodedSkipped: 0,
		explodedFailed: 0,
		errors: [],
		markdown: rendered.markdown,
	};
	if (parsed.length === 0) return result;

	try {
		await environment.writeClipboard(rendered.markdown);
		result.clipboardCopied = true;
	} catch (error) {
		result.errors.push(`Clipboard: ${error instanceof Error ? error.message : String(error)}`);
	}

	if (!settings.createNewFile) return result;
	const mainPath = await availableMainPath(
		markdownPath(`Highlights for ${sourceBasename}`),
		environment,
	);
	const mainContents = `${rendered.markdown}\n## Source\n\n- [[${sourceBasename}]]\n`;
	try {
		await environment.createFile(mainPath, mainContents);
		result.mainFilePath = mainPath;
		await environment.openFile(mainPath);
	} catch (error) {
		result.errors.push(`Highlights note: ${error instanceof Error ? error.message : String(error)}`);
		return result;
	}

	if (!settings.createLinks || !settings.explodeIntoNotes) return result;
	const pathsSeen = new Set<string>();
	for (const item of rendered.highlights) {
		if (item.noteBasename.length === 0) {
			result.explodedSkipped += 1;
			continue;
		}
		const path = markdownPath(item.noteBasename);
		if (pathsSeen.has(path) || (await environment.fileExists(path))) {
			result.explodedSkipped += 1;
			continue;
		}
		pathsSeen.add(path);
		const quote = settings.createContextualQuotes ? item.context : item.text;
		const contents = `## Source\n\n> ${quote}[^1]\n\n[^1]: [[${sourceBasename}]]\n`;
		try {
			await environment.createFile(path, contents);
			result.explodedCreated += 1;
			if (settings.openExplodedNotes) await environment.openFile(path);
		} catch (error) {
			result.explodedFailed += 1;
			result.errors.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	return result;
}
