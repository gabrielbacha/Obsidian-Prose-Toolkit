import { describe, expect, it } from "vitest";
import {
	coordinateExtraction,
	type ExtractionEnvironment,
} from "../src/extraction/coordinator";
import { extractHighlights } from "../src/extraction/parser";
import { renderExtraction, sanitizeNoteBasename } from "../src/extraction/render";
import { DEFAULT_SETTINGS, type ProseToolkitSettings } from "../src/settings";

function settings(
	overrides: Partial<ProseToolkitSettings> = {},
): ProseToolkitSettings {
	return { ...DEFAULT_SETTINGS, ...overrides };
}

function memoryEnvironment(initialPaths: string[] = []) {
	const files = new Map(initialPaths.map((path) => [path, "existing"]));
	const opened: string[] = [];
	let clipboard = "";
	const environment: ExtractionEnvironment = {
		writeClipboard: async (value) => {
			clipboard = value;
		},
		fileExists: async (path) => files.has(path),
		createFile: async (path, contents) => {
			if (files.has(path)) throw new Error("overwrite attempted");
			files.set(path, contents);
		},
		openFile: async (path) => {
			opened.push(path);
		},
	};
	return {
		environment,
		files,
		opened,
		get clipboard() {
			return clipboard;
		},
	};
}

describe("highlight parser", () => {
	it("extracts paired equals, attributed marks, and optional bold in order", () => {
		const input =
			"A ==**bold point**== then **standalone** and <mark class=\"yellow\">marked\ntext</mark>.";
		const result = extractHighlights(input, true);
		expect(result.map((item) => [item.kind, item.content])).toEqual([
			["equals", "**bold point**"],
			["bold", "standalone"],
			["mark", "marked text"],
		]);
	});

	it("does not duplicate bold nested inside a highlight", () => {
		const result = extractHighlights("==**Keep bold.**==", true);
		expect(result).toHaveLength(1);
		expect(result[0].content).toBe("**Keep bold.**");
	});

	it("ignores standalone bold unless enabled", () => {
		expect(extractHighlights("**Bold**", false)).toEqual([]);
		expect(extractHighlights("**Bold**", true)[0].content).toBe("Bold");
	});

	it("rejects unmatched opening delimiters and tags", () => {
		expect(extractHighlights("==unfinished <mark>also unfinished", true)).toEqual([]);
	});

	it("captures a complete contextual line", () => {
		const [result] = extractHighlights("Before\nContext ==focus== remains.\nAfter", false);
		expect(result.context).toBe("Context ==focus== remains.");
	});
});

describe("extraction renderer", () => {
	it("preserves inner bold and defaults to paragraph-separated output", () => {
		const parsed = extractHighlights("==**First.**== and ==second.==", false);
		const result = renderExtraction(parsed, "Source", settings());
		expect(result.markdown).toBe("**First.**\n\nsecond.\n");
	});

	it("renders headings, bullets, links, capitalization, and one source footnote", () => {
		const parsed = extractHighlights("==first point== ==second point==", false);
		const result = renderExtraction(
			parsed,
			"Example",
			settings({
				headlineText: "Notes from $NOTE_TITLE",
				outputFormat: "bullets",
				createLinks: true,
				addFootnotes: true,
				autoCapitalize: true,
			}),
		);
		expect(result.markdown).toBe(
			"## Notes from Example\n\n- [[First point]][^1]\n- [[Second point]][^1]\n\n[^1]: [[Example]]\n",
		);
	});

	it("sanitizes invalid filename characters and limits names to 100 characters", () => {
		expect(sanitizeNoteBasename('A: \\ / * ? " < > | # [x] ^')).toBe("A x");
		expect(sanitizeNoteBasename("a".repeat(101))).toHaveLength(100);
		expect(sanitizeNoteBasename("a".repeat(101))).toMatch(/\.\.\.$/u);
	});
});

describe("extraction coordinator", () => {
	it("copies output without creating files when disabled", async () => {
		const memory = memoryEnvironment();
		const result = await coordinateExtraction(
			"==Point==",
			"Source",
			settings(),
			memory.environment,
		);
		expect(result.clipboardCopied).toBe(true);
		expect(memory.clipboard).toBe("Point\n");
		expect(memory.files.size).toBe(0);
	});

	it("uses a numbered main note and never overwrites", async () => {
		const memory = memoryEnvironment([
			"Highlights for Source.md",
			"Highlights for Source 2.md",
		]);
		const result = await coordinateExtraction(
			"==Point==",
			"Source",
			settings({ createNewFile: true }),
			memory.environment,
		);
		expect(result.mainFilePath).toBe("Highlights for Source 3.md");
		expect(memory.opened).toEqual(["Highlights for Source 3.md"]);
		expect(memory.files.get("Highlights for Source.md")).toBe("existing");
	});

	it("creates exploded notes, skips duplicates and existing files", async () => {
		const memory = memoryEnvironment(["Existing.md"]);
		const result = await coordinateExtraction(
			"==New== ==New== ==Existing==",
			"Source",
			settings({
				createNewFile: true,
				createLinks: true,
				explodeIntoNotes: true,
				openExplodedNotes: true,
			}),
			memory.environment,
		);
		expect(result.explodedCreated).toBe(1);
		expect(result.explodedSkipped).toBe(2);
		expect(memory.files.get("New.md")).toContain("> New[^1]");
		expect(memory.files.get("Existing.md")).toBe("existing");
		expect(memory.opened).toContain("New.md");
	});

	it("uses contextual source lines in exploded notes", async () => {
		const memory = memoryEnvironment();
		await coordinateExtraction(
			"Full line with ==focus== and context.",
			"Source",
			settings({
				createNewFile: true,
				createLinks: true,
				explodeIntoNotes: true,
				createContextualQuotes: true,
			}),
			memory.environment,
		);
		expect(memory.files.get("focus.md")).toContain(
			"> Full line with ==focus== and context.[^1]",
		);
	});

	it("reports clipboard failure but still creates the requested note", async () => {
		const memory = memoryEnvironment();
		memory.environment.writeClipboard = async () => {
			throw new Error("denied");
		};
		const result = await coordinateExtraction(
			"==Point==",
			"Source",
			settings({ createNewFile: true }),
			memory.environment,
		);
		expect(result.clipboardCopied).toBe(false);
		expect(result.errors[0]).toContain("denied");
		expect(result.mainFilePath).toBe("Highlights for Source.md");
	});

	it("stops exploded-note generation when the main note cannot be created", async () => {
		const memory = memoryEnvironment();
		memory.environment.createFile = async () => {
			throw new Error("disk full");
		};
		const result = await coordinateExtraction(
			"==Point==",
			"Source",
			settings({
				createNewFile: true,
				createLinks: true,
				explodeIntoNotes: true,
			}),
			memory.environment,
		);
		expect(result.mainFilePath).toBeNull();
		expect(result.explodedCreated).toBe(0);
		expect(result.errors[0]).toContain("disk full");
	});

	it("continues after an individual exploded note fails", async () => {
		const memory = memoryEnvironment();
		const create = memory.environment.createFile;
		memory.environment.createFile = async (path, contents) => {
			if (path === "Broken.md") throw new Error("invalid path");
			await create(path, contents);
		};
		const result = await coordinateExtraction(
			"==Broken== ==Working==",
			"Source",
			settings({
				createNewFile: true,
				createLinks: true,
				explodeIntoNotes: true,
			}),
			memory.environment,
		);
		expect(result.explodedFailed).toBe(1);
		expect(result.explodedCreated).toBe(1);
		expect(memory.files.has("Working.md")).toBe(true);
	});

	it("returns a no-op result when no highlights exist", async () => {
		const memory = memoryEnvironment();
		const result = await coordinateExtraction(
			"Plain text",
			"Source",
			settings(),
			memory.environment,
		);
		expect(result.found).toBe(0);
		expect(result.markdown).toBe("");
		expect(memory.clipboard).toBe("");
	});
});
