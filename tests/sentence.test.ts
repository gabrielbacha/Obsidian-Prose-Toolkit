import { describe, expect, it } from "vitest";
import {
	deleteToBoundary,
	moveToStartOfCurrentSentence,
	moveToStartOfNextSentence,
	selectCurrentLine,
	selectSentence,
	selectToBoundary,
} from "../src/sentence/actions";
import { listPrefixLength, sentenceRanges } from "../src/sentence/ranges";
import { compileSentenceRegex, DEFAULT_SENTENCE_REGEX } from "../src/settings";
import { MockEditor } from "./mock-editor";

const pattern = () => compileSentenceRegex(DEFAULT_SENTENCE_REGEX);

describe("sentence ranges", () => {
	it("finds prose sentences including punctuation-free final text", () => {
		expect(sentenceRanges("First. Second! Third", pattern())).toEqual([
			{ from: 0, to: 6 },
			{ from: 7, to: 14 },
			{ from: 15, to: 20 },
		]);
	});

	it.each([
		["- Item", 2],
		["  * Item", 4],
		["1. Item", 3],
		["> Quote", 2],
		["- [x] Task", 6],
	])("recognizes Markdown prefix in %s", (value, expected) => {
		expect(listPrefixLength(value)).toBe(expected);
	});
});

describe("sentence actions", () => {
	it("deletes to the start of a sentence", () => {
		const mock = new MockEditor("First sentence. Second sentence.", { line: 0, ch: 22 });
		deleteToBoundary(mock.asEditor(), "start", pattern());
		expect(mock.getValue()).toBe("First sentence.  sentence.");
		expect(mock.getCursor()).toEqual({ line: 0, ch: 16 });
	});

	it("deletes to the end of a sentence", () => {
		const mock = new MockEditor("First sentence. Second sentence.", { line: 0, ch: 22 });
		deleteToBoundary(mock.asEditor(), "end", pattern());
		expect(mock.getValue()).toBe("First sentence. Second");
		expect(mock.getCursor()).toEqual({ line: 0, ch: 22 });
	});

	it("selects from the cursor to either boundary", () => {
		const backward = new MockEditor("First sentence. Second.", { line: 0, ch: 6 });
		selectToBoundary(backward.asEditor(), "start", pattern());
		expect(backward.getSelection()).toBe("First ");

		const forward = new MockEditor("First sentence. Second.", { line: 0, ch: 6 });
		selectToBoundary(forward.asEditor(), "end", pattern());
		expect(forward.getSelection()).toBe("sentence.");
	});

	it("selects the current sentence without list or checklist prefixes", () => {
		const bullet = new MockEditor("- [ ] First sentence. Second.", { line: 0, ch: 10 });
		selectSentence(bullet.asEditor(), pattern());
		expect(bullet.getSelection()).toBe("First sentence.");
	});

	it("selects the complete current line", () => {
		const mock = new MockEditor("One\nCurrent line\nThree", { line: 1, ch: 4 });
		selectCurrentLine(mock.asEditor());
		expect(mock.getSelection()).toBe("Current line");
	});

	it("moves to the current sentence start", () => {
		const mock = new MockEditor("First. Second sentence.", { line: 0, ch: 15 });
		moveToStartOfCurrentSentence(mock.asEditor(), pattern());
		expect(mock.getCursor()).toEqual({ line: 0, ch: 7 });
	});

	it("moves across blank lines when at the start or end of a line", () => {
		const backward = new MockEditor("Previous.\n\nCurrent.", { line: 2, ch: 0 });
		moveToStartOfCurrentSentence(backward.asEditor(), pattern());
		expect(backward.getCursor()).toEqual({ line: 0, ch: 0 });

		const forward = new MockEditor("Current.\n\n- Next.", { line: 0, ch: 8 });
		moveToStartOfNextSentence(forward.asEditor(), pattern());
		expect(forward.getCursor()).toEqual({ line: 2, ch: 2 });
	});

	it("moves to the next sentence on the same line", () => {
		const mock = new MockEditor("First sentence.   Second.", { line: 0, ch: 4 });
		moveToStartOfNextSentence(mock.asEditor(), pattern());
		expect(mock.getCursor()).toEqual({ line: 0, ch: 18 });
	});
});
