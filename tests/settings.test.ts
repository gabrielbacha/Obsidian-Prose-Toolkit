import { describe, expect, it } from "vitest";
import {
	compileSentenceRegex,
	DEFAULT_SETTINGS,
	isValidSentenceRegex,
	normalizeSettings,
} from "../src/settings";

describe("settings", () => {
	it("uses paragraph output by default", () => {
		expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
		expect(DEFAULT_SETTINGS.outputFormat).toBe("paragraphs");
	});

	it("normalizes invalid output and dependent explode settings", () => {
		const settings = normalizeSettings({
			outputFormat: "unknown" as "paragraphs",
			explodeIntoNotes: true,
			openExplodedNotes: true,
			createLinks: false,
			createNewFile: true,
		});
		expect(settings.outputFormat).toBe("paragraphs");
		expect(settings.explodeIntoNotes).toBe(false);
		expect(settings.openExplodedNotes).toBe(false);
	});

	it("validates and compiles sentence expressions", () => {
		expect(isValidSentenceRegex("[a-z]+")).toBe(true);
		expect(isValidSentenceRegex("[")).toBe(false);
		expect(isValidSentenceRegex("")).toBe(false);
		expect(Array.from("One two".matchAll(compileSentenceRegex("[^ ]+")))).toHaveLength(2);
	});
});
