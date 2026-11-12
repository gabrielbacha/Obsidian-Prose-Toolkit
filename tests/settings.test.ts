import { describe, expect, it } from "vitest";
import {
	compileSentenceRegex,
	DEFAULT_SETTINGS,
	isValidSentenceRegex,
	normalizeSettings,
	settingsProblem,
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

	it("accepts unknown data without turning wrong types or future versions into file creation", () => {
		for (const data of [null, [], "invalid", 1, { createNewFile: "false" }, { createLinks: {}, createNewFile: "true" }, { schemaVersion: 99, createNewFile: true }]) {
			expect(normalizeSettings(data).createNewFile).toBe(false);
		}
		expect(normalizeSettings({ sentenceRegexSource: null, headlineText: [], addFootnotes: "false" })).toEqual(DEFAULT_SETTINGS);
		expect(settingsProblem({ schemaVersion: 99 })).toMatch(/unsupported version/);
		expect(settingsProblem({ createNewFile: "true" })).toMatch(/invalid types/);
		expect(settingsProblem({ schemaVersion: 1, createNewFile: false })).toBeNull();
	});

	it("validates and compiles sentence expressions", () => {
		expect(isValidSentenceRegex("[a-z]+")).toBe(true);
		expect(isValidSentenceRegex("[")).toBe(false);
		expect(isValidSentenceRegex("")).toBe(false);
		expect(Array.from("One two".matchAll(compileSentenceRegex("[^ ]+")))).toHaveLength(2);
	});
});
