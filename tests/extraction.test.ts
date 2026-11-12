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
		readFile: async (path) => files.get(path) ?? null,
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
		const originalEnvironment = { ...memory.environment };
		memory.environment.createFile = async (path, contents) => {
			if (path === "Broken.md") throw new Error("invalid path");
			await originalEnvironment.createFile(path, contents);
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

describe("extraction request boundaries", () => {
	it("retains full source paths for same-named notes and escapes link punctuation", async () => {
		for (const folder of ["First folder", "Second folder"]) {
			const memory = memoryEnvironment();
			const source = { path: folder + "/A [note] #1.md", title: "A [note] #1" };
			await coordinateExtraction("==Point==", source, settings({ createNewFile: true, createLinks: true, explodeIntoNotes: true, addFootnotes: true }), memory.environment);
			const link = "[A \\[note\\] #1](<" + folder.replace(" ", "%20") + "/A%20%5Bnote%5D%20%231.md>)";
			expect(memory.clipboard).toContain(link);
			expect([...memory.files.values()].every((contents) => contents.includes(link))).toBe(true);
		}
	});
	it("uses the initial source and settings while clipboard access is pending", async () => {
		const memory = memoryEnvironment();
		let release!: () => void;
		memory.environment.writeClipboard = () => new Promise<void>((resolve) => { release = resolve; });
		const initial = settings({ createNewFile: true, createLinks: true, explodeIntoNotes: true });
		const source = { path: "Original/Source.md", title: "Source" };
		const running = coordinateExtraction("==Point==", source, initial, memory.environment);
		initial.createNewFile = false; initial.createLinks = false; initial.explodeIntoNotes = false;
		source.path = "Changed/Source.md"; source.title = "Changed";
		release();
		const result = await running;
		expect(result.mainFilePath).toBe("Highlights for Source.md");
		expect(result.explodedCreated).toBe(1);
		expect(memory.files.get("Point.md")).toContain("Original/Source.md");
	});
	it("retries racing create-only summary collisions without replacing either operation", async () => {
		const memory = memoryEnvironment();
		const results = await Promise.all([1, 2].map(() => coordinateExtraction("==Point==", "Source", settings({ createNewFile: true }), memory.environment)));
		expect(results.map((result) => result.mainFilePath).sort()).toEqual(["Highlights for Source 2.md", "Highlights for Source.md"]);
		expect(new Set(results.map((result) => result.operationId)).size).toBe(2);
		for (const result of results) expect(memory.files.get(result.mainFilePath!)).toContain(result.operationId);
	});
	it("continues exploded creation after summary opening fails", async () => {
		const memory = memoryEnvironment();
		memory.environment.openFile = async () => { throw new Error("view unavailable"); };
		const result = await coordinateExtraction("==One== ==Two==", "Source", settings({ createNewFile: true, createLinks: true, explodeIntoNotes: true }), memory.environment);
		expect(result.mainFilePath).toBe("Highlights for Source.md");
		expect(result.mainOpened).toBe(false);
		expect(result.explodedCreated).toBe(2);
		expect(result.outcomes.filter((outcome) => outcome.stage === "creation" && outcome.status === "complete")).toHaveLength(3);
		expect(result.outcomes).toContainEqual(expect.objectContaining({ stage: "opening", status: "failed", path: "Highlights for Source.md" }));
	});
	it("returns discovery failures and continues other exploded notes", async () => {
		const memory = memoryEnvironment(), original = { ...memory.environment };
		memory.environment.fileExists = async (path) => { if (path === "Broken.md") throw new Error("index unavailable"); return original.fileExists(path); };
		const result = await coordinateExtraction("==Broken== ==Working==", "Source", settings({ createNewFile: true, createLinks: true, explodeIntoNotes: true }), memory.environment);
		expect(result.explodedCreated).toBe(1); expect(result.explodedFailed).toBe(1);
		expect(result.outcomes).toContainEqual(expect.objectContaining({ stage: "discovery", path: "Broken.md", status: "failed" }));
	});
	it("confirms an accepted create with a lost response using the operation's exact contents", async () => {
		const memory = memoryEnvironment(), original = { ...memory.environment };
		memory.environment.createFile = async (path, contents) => { await original.createFile(path, contents); throw new Error("response lost"); };
		const result = await coordinateExtraction("==Point==", "Source", settings({ createNewFile: true }), memory.environment);
		expect(result.mainFilePath).toBe("Highlights for Source.md"); expect(memory.files.size).toBe(1);
		expect(result.outcomes).toContainEqual(expect.objectContaining({ stage: "creation", status: "complete", message: "Creation confirmed after a lost response." }));
	});
	it("retains an uncertain target without creating a duplicate when read-back fails", async () => {
		const memory = memoryEnvironment(), original = { ...memory.environment };
		memory.environment.createFile = async (path, contents) => { await original.createFile(path, contents); throw new Error("response lost"); };
		memory.environment.readFile = async () => { throw new Error("read unavailable"); };
		const result = await coordinateExtraction("==Point==", "Source", settings({ createNewFile: true }), memory.environment);
		expect(result.mainFilePath).toBeNull(); expect(result.mainUncertainPath).toBe("Highlights for Source.md"); expect(memory.files.size).toBe(1);
		expect(result.outcomes).toContainEqual(expect.objectContaining({ stage: "creation", status: "uncertain" }));
	});
});

describe("Markdown extraction context", () => {
	it("ignores frontmatter, fenced and indented code, inline code and HTML comments", () => {
		const tick = String.fromCharCode(96);
		const source = [
			"---", "title: ==metadata==", "---",
			tick.repeat(3) + "md", "==fenced== <mark>literal</mark>", tick.repeat(3),
			"    ==indented==",
			tick + "==inline==" + tick,
			"<!-- ==comment== -->",
			"Normal ==visible== and **bold**.",
		].join("\n");
		expect(extractHighlights(source, true).map((item) => item.content)).toEqual(["visible", "bold"]);
	});
	it("does not pair escaped delimiters or unrelated Markdown blocks", () => {
		const source = "\\==literal==\n\n==open\n\nclose==\n\n- ==first\n- last==\n\n==good==";
		expect(extractHighlights(source, false).map((item) => item.content)).toEqual(["good"]);
	});
	it("retains attributed marks, soft line breaks and nested bold precedence", () => {
		const source = "<mark class=\"yellow\">marked\ntext</mark>\n\n==**bold point**==";
		expect(extractHighlights(source, true).map((item) => item.content)).toEqual(["marked text", "**bold point**"]);
	});
});

describe("HTML prose eligibility", () => {
	it("ignores attribute syntax while preserving explicit mark contents", () => {
		const source = "<span title=\"==not prose==\">plain</span> <mark title=\"greater > than\">visible</mark>";
		expect(extractHighlights(source, false).map((item) => item.content)).toEqual(["visible"]);
	});
	it("does not treat a quoted mark tag inside another attribute as a highlight", () => {
		const source = "<span title='<mark>not prose</mark>'>plain</span> ==visible==";
		expect(extractHighlights(source, false).map((item) => item.content)).toEqual(["visible"]);
	});
});

describe("cancelled extraction publication", () => {
	it("keeps an acknowledged note and stops before later creations", async () => {
		const memory = memoryEnvironment(), original = { ...memory.environment }, controller = new AbortController();
		memory.environment.createFile = async (path, contents) => { await original.createFile(path, contents); controller.abort(); };
		const result = await coordinateExtraction("==One== ==Two==", "Source", settings({ createNewFile: true, createLinks: true, explodeIntoNotes: true }), memory.environment, { signal: controller.signal });
		expect(result.cancelled).toBe(true); expect(result.mainFilePath).toBe("Highlights for Source.md");
		expect(memory.files.size).toBe(1); expect(result.explodedCreated).toBe(0); expect(memory.opened).toHaveLength(0);
	});
});

describe("accepted highlight work limits", () => {
	it("does not count suppressed inner bold as extracted output", () => {
		const text = "==" + "**inner** ".repeat(15000).trimEnd() + "==";
		const result = extractHighlights(text, true, 1);
		expect(result).toHaveLength(1); expect(result[0].kind).toBe("equals"); expect(result[0].content).toContain("**inner**");
	});
	it("retains leftmost precedence when delimiter kinds overlap", () => {
		expect(extractHighlights("==A **B== C**", true).map((item) => item.content)).toEqual(["A **B"]);
		expect(extractHighlights("**A ==B** C==", true).map((item) => item.content)).toEqual(["A ==B"]);
	});
});
