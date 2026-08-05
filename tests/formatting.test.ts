import { describe, expect, it } from "vitest";
import {
	BOLD_HIGHLIGHT_WRAPPER,
	BOLD_WRAPPER,
	HIGHLIGHT_WRAPPER,
	toggleLineFormat,
	toggleSentenceFormat,
} from "../src/formatting";
import { compileSentenceRegex, DEFAULT_SENTENCE_REGEX } from "../src/settings";
import { MockEditor } from "./mock-editor";

const pattern = () => compileSentenceRegex(DEFAULT_SENTENCE_REGEX);

describe("formatting commands", () => {
	it.each([
		[HIGHLIGHT_WRAPPER, "==First sentence.== Next."],
		[BOLD_WRAPPER, "**First sentence.** Next."],
		[BOLD_HIGHLIGHT_WRAPPER, "==**First sentence.**== Next."],
	])("toggles a sentence wrapper", (wrapper, expected) => {
		const mock = new MockEditor("First sentence. Next.", { line: 0, ch: 5 });
		toggleSentenceFormat(mock.asEditor(), pattern(), wrapper);
		expect(mock.getValue()).toBe(expected);
		toggleSentenceFormat(mock.asEditor(), pattern(), wrapper);
		expect(mock.getValue()).toBe("First sentence. Next.");
	});

	it("toggles a complete punctuation-free line", () => {
		const mock = new MockEditor("Whole line", { line: 0, ch: 4 });
		toggleLineFormat(mock.asEditor(), BOLD_HIGHLIGHT_WRAPPER);
		expect(mock.getValue()).toBe("==**Whole line**==");
		toggleLineFormat(mock.asEditor(), BOLD_HIGHLIGHT_WRAPPER);
		expect(mock.getValue()).toBe("Whole line");
	});

	it("does nothing on a blank line", () => {
		const mock = new MockEditor("", { line: 0, ch: 0 });
		toggleSentenceFormat(mock.asEditor(), pattern(), HIGHLIGHT_WRAPPER);
		toggleLineFormat(mock.asEditor(), BOLD_WRAPPER);
		expect(mock.getValue()).toBe("");
	});

	it("preserves cursor position relative to sentence content", () => {
		const mock = new MockEditor("First sentence.", { line: 0, ch: 5 });
		toggleSentenceFormat(mock.asEditor(), pattern(), HIGHLIGHT_WRAPPER);
		expect(mock.getCursor()).toEqual({ line: 0, ch: 7 });
		toggleSentenceFormat(mock.asEditor(), pattern(), HIGHLIGHT_WRAPPER);
		expect(mock.getCursor()).toEqual({ line: 0, ch: 5 });
	});

	it("preserves a selection relative to formatted content", () => {
		const mock = new MockEditor("First sentence.", { line: 0, ch: 1 });
		mock.setSelection({ line: 0, ch: 1 }, { line: 0, ch: 5 });
		toggleSentenceFormat(mock.asEditor(), pattern(), BOLD_WRAPPER);
		expect(mock.getSelection()).toBe("irst");
		expect(mock.getCursor("anchor")).toEqual({ line: 0, ch: 3 });
		expect(mock.getCursor("head")).toEqual({ line: 0, ch: 7 });
	});

	it("preserves inner bold when adding a highlight wrapper", () => {
		const mock = new MockEditor("**Important.**", { line: 0, ch: 5 });
		toggleSentenceFormat(mock.asEditor(), pattern(), HIGHLIGHT_WRAPPER);
		expect(mock.getValue()).toBe("==**Important.**==");
	});

	it("keeps a cursor after a wrapped range after removing it", () => {
		const mock = new MockEditor("==First.== Next.", { line: 0, ch: 10 });
		toggleSentenceFormat(mock.asEditor(), pattern(), HIGHLIGHT_WRAPPER);
		expect(mock.getValue()).toBe("First. Next.");
		expect(mock.getCursor()).toEqual({ line: 0, ch: 6 });
	});
});
