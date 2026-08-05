/*
 * Adapted from Sentence Navigator by Tim Hor and Andrew Brown.
 * Copyright (c) 2021 Tim Hor. Used under the MIT License.
 * See THIRD_PARTY_NOTICES.md.
 */
import type { Editor } from "obsidian";
import {
	linePosition,
	listPrefixLength,
	nextNonEmptyLine,
	previousNonEmptyLine,
	sentenceAt,
	sentenceRanges,
} from "./ranges";

export type Boundary = "start" | "end";

function skipSpaces(text: string, character: number, direction: Boundary): number {
	let cursor = character;
	if (direction === "start") {
		while (cursor > 0 && text[cursor - 1] === " ") cursor -= 1;
	} else {
		while (cursor < text.length && text[cursor] === " ") cursor += 1;
	}
	return cursor;
}

export function deleteToBoundary(
	editor: Editor,
	boundary: Boundary,
	pattern: RegExp,
): void {
	const original = editor.getCursor();
	const text = editor.getLine(original.line);
	const searchCharacter = skipSpaces(text, original.ch, boundary);
	const sentence = sentenceAt(text, searchCharacter, pattern);
	if (!sentence) return;
	const from = boundary === "start" ? sentence.from : original.ch;
	const to = boundary === "start" ? original.ch : sentence.to;
	if (to <= from) return;
	editor.replaceRange("", linePosition(original.line, from), linePosition(original.line, to));
	editor.setCursor(linePosition(original.line, from));
}

export function selectToBoundary(
	editor: Editor,
	boundary: Boundary,
	pattern: RegExp,
): void {
	const cursor = editor.getCursor();
	const text = editor.getLine(cursor.line);
	const sentence = sentenceAt(text, cursor.ch, pattern);
	if (!sentence) return;
	if (
		editor.getSelection().length > 0 &&
		(cursor.ch === sentence.from || cursor.ch === sentence.to)
	) {
		return;
	}
	const target = boundary === "start" ? sentence.from : sentence.to;
	editor.setSelection(cursor, linePosition(cursor.line, target));
}

export function moveToStartOfCurrentSentence(
	editor: Editor,
	pattern: RegExp,
): void {
	let cursor = editor.getCursor();
	let text = editor.getLine(cursor.line);
	const prefixLength = listPrefixLength(text);
	if (cursor.ch === 0 || (prefixLength > 0 && cursor.ch === prefixLength)) {
		const previous = previousNonEmptyLine(editor, cursor.line);
		editor.setCursor(linePosition(previous, editor.getLine(previous).length));
		cursor = editor.getCursor();
		text = editor.getLine(cursor.line);
	}
	const searchCharacter = skipSpaces(text, cursor.ch, "start");
	const sentence = sentenceAt(text, searchCharacter, pattern);
	if (sentence && searchCharacter > sentence.from) {
		editor.setCursor(linePosition(cursor.line, sentence.from));
	}
}

export function moveToStartOfNextSentence(
	editor: Editor,
	pattern: RegExp,
): void {
	const cursor = editor.getCursor();
	const text = editor.getLine(cursor.line);
	if (cursor.ch >= text.length) {
		const next = nextNonEmptyLine(editor, cursor.line);
		editor.setCursor(linePosition(next, listPrefixLength(editor.getLine(next))));
		return;
	}
	const searchCharacter = skipSpaces(text, cursor.ch, "end");
	const sentence = sentenceAt(text, searchCharacter, pattern);
	if (!sentence) return;
	let target = skipSpaces(text, sentence.to, "end");
	if (target >= text.length) {
		const next = nextNonEmptyLine(editor, cursor.line);
		if (next !== cursor.line) {
			editor.setCursor(linePosition(next, listPrefixLength(editor.getLine(next))));
			return;
		}
		target = text.length;
	}
	editor.setCursor(linePosition(cursor.line, target));
}

export function selectSentence(editor: Editor, pattern: RegExp): void {
	const cursor = editor.getCursor();
	const text = editor.getLine(cursor.line);
	const offset = listPrefixLength(text);
	const processed = text.slice(offset);
	const sentence = sentenceRanges(processed, pattern).find(
		(range) => cursor.ch <= offset + range.to,
	);
	if (!sentence) return;
	editor.setSelection(
		linePosition(cursor.line, offset + sentence.from),
		linePosition(cursor.line, offset + sentence.to),
	);
}

export function selectCurrentLine(editor: Editor): void {
	const cursor = editor.getCursor();
	editor.setSelection(
		linePosition(cursor.line, 0),
		linePosition(cursor.line, editor.getLine(cursor.line).length),
	);
}

