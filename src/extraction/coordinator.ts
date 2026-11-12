import { localId } from "../local-id";
import { normalizeSettings, type ProseToolkitSettings } from "../settings";
import { extractHighlights, type ExtractedHighlight } from "./parser";
import { renderExtraction, sanitizeNoteBasename } from "./render";
import { sourceLink, sourceTitle, type ExtractionSource } from "./source";

export interface ExtractionEnvironment {
	writeClipboard(value: string): Promise<void>;
	fileExists(path: string): Promise<boolean>;
	createFile(path: string, contents: string): Promise<void>;
	readFile?(path: string): Promise<string | null>;
	openFile(path: string): Promise<void>;
}
export interface ExtractionOutcome {
	stage: "clipboard" | "discovery" | "creation" | "opening";
	status: "complete" | "skipped" | "failed" | "uncertain";
	path?: string;
	message?: string;
}
export interface ExtractionResult {
	operationId: string;
	cancelled: boolean;
	found: number;
	clipboardCopied: boolean;
	mainFilePath: string | null;
	mainOpened: boolean;
	mainUncertainPath: string | null;
	explodedCreated: number;
	explodedSkipped: number;
	explodedFailed: number;
	explodedOpened: number;
	explodedUncertain: number;
	outcomes: ExtractionOutcome[];
	errors: string[];
	markdown: string;
}
const MAX_COLLISION_ATTEMPTS = 1000;
function markdownPath(basename: string): string {
	return basename.toLowerCase().endsWith(".md") ? basename : `${basename}.md`;
}
function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** Every operation uses one source/settings snapshot and create-only writes. */
export async function coordinateExtraction(
	markdown: string,
	inputSource: ExtractionSource | string,
	inputSettings: ProseToolkitSettings,
	environment: ExtractionEnvironment,
	options: { highlights?: ExtractedHighlight[]; signal?: AbortSignal } = {},
): Promise<ExtractionResult> {
	const settings = Object.freeze(normalizeSettings(inputSettings));
	const source = typeof inputSource === "string" ? inputSource : Object.freeze({ ...inputSource });
	const parsed = options.highlights ?? extractHighlights(markdown, settings.useBoldForHighlights);
	const rendered = renderExtraction(parsed, source, settings);
	const operationId = localId();
	const marker = `<!-- prose-toolkit-operation: ${operationId} -->`;
	const result: ExtractionResult = {
		operationId, cancelled: false, found: parsed.length, clipboardCopied: false, mainFilePath: null, mainOpened: false, mainUncertainPath: null,
		explodedCreated: 0, explodedSkipped: 0, explodedFailed: 0, explodedOpened: 0, explodedUncertain: 0,
		outcomes: [], errors: [], markdown: rendered.markdown,
	};
	function failed(stage: ExtractionOutcome["stage"], error: unknown, path?: string) {
		const detail = message(error);
		result.outcomes.push({ stage, status: "failed", path, message: detail });
		result.errors.push(`${stage}${path ? ` (${path})` : ""}: ${detail}`);
	}
	async function exists(path: string): Promise<boolean | null> {
		try { return await environment.fileExists(path); }
		catch (error) { failed("discovery", error, path); return null; }
	}
	async function create(path: string, contents: string): Promise<"created" | "collision" | "failed" | "uncertain"> {
		try {
			await environment.createFile(path, contents);
			result.outcomes.push({ stage: "creation", status: "complete", path });
			return "created";
		} catch (error) {
			const present = await exists(path);
			if (present === null || (present && !environment.readFile)) {
				result.outcomes.push({ stage: "creation", status: "uncertain", path, message: message(error) });
				result.errors.push("creation (" + path + "): result could not be confirmed. Check this note before retrying.");
				return "uncertain";
			}
			if (present && environment.readFile) {
				try {
					if (await environment.readFile(path) === contents) {
						result.outcomes.push({ stage: "creation", status: "complete", path, message: "Creation confirmed after a lost response." });
						return "created";
					}
				} catch (readError) {
					result.outcomes.push({ stage: "creation", status: "uncertain", path, message: message(readError) });
					result.errors.push(`creation (${path}): result could not be confirmed. Check this note before retrying.`);
					return "uncertain";
				}
			}
			if (present) return "collision";
			failed("creation", error, path);
			return "failed";
		}
	}
	async function open(path: string): Promise<boolean> {
		try { await environment.openFile(path); result.outcomes.push({ stage: "opening", status: "complete", path }); return true; }
		catch (error) { failed("opening", error, path); return false; }
	}
	const cancelled = () => { result.cancelled = options.signal?.aborted === true; return result.cancelled; };
	if (!parsed.length || cancelled()) return result;
	try { await environment.writeClipboard(rendered.markdown); result.clipboardCopied = true; result.outcomes.push({ stage: "clipboard", status: "complete" }); }
	catch (error) { failed("clipboard", error); }
	if (cancelled() || !settings.createNewFile) return result;
	const stem = `Highlights for ${sanitizeNoteBasename(sourceTitle(source)) || "Untitled"}`;
	const mainContents = `${marker}\n${rendered.markdown}\n## Source\n\n- ${sourceLink(source)}\n`;
	for (let attempt = 1; attempt <= MAX_COLLISION_ATTEMPTS; attempt++) {
		const path = markdownPath(attempt === 1 ? stem : `${stem} ${attempt}`);
		if (cancelled()) return result;
		const present = await exists(path);
		if (cancelled()) return result;
		if (present === null) return result;
		if (present) continue;
		const created = await create(path, mainContents);
		if (created === "collision") continue;
		if (created === "uncertain") { result.mainUncertainPath = path; return result; }
		if (created === "failed") return result;
		result.mainFilePath = path;
		if (cancelled()) return result;
		result.mainOpened = await open(path);
		if (cancelled()) return result;
		break;
	}
	if (!result.mainFilePath) { failed("creation", new Error("No free summary name was found after 1,000 attempts.")); return result; }
	if (!settings.createLinks || !settings.explodeIntoNotes) return result;
	const pathsSeen = new Set<string>();
	for (const item of rendered.highlights) {
		if (cancelled()) return result;
		if (!item.noteBasename) { result.explodedSkipped++; continue; }
		const path = markdownPath(item.noteBasename);
		if (pathsSeen.has(path)) { result.explodedSkipped++; continue; }
		pathsSeen.add(path);
		if (cancelled()) return result;
		const present = await exists(path);
		if (cancelled()) return result;
		if (present === null) { result.explodedFailed++; continue; }
		if (present) { result.explodedSkipped++; result.outcomes.push({ stage: "creation", status: "skipped", path }); continue; }
		const quote = settings.createContextualQuotes ? item.context : item.text;
		const contents = `${marker}\n## Source\n\n> ${quote}[^1]\n\n[^1]: ${sourceLink(source)}\n`;
		const created = await create(path, contents);
		if (created === "collision") result.explodedSkipped++;
		else if (created === "failed") result.explodedFailed++;
		else if (created === "uncertain") result.explodedUncertain++;
		else { result.explodedCreated++; if (cancelled()) return result; if (settings.openExplodedNotes && await open(path)) result.explodedOpened++; }
	}
	return result;
}
