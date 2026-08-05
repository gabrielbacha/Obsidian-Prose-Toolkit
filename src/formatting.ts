import type { Editor, EditorPosition } from "obsidian";
import { sentenceAt, type TextRange } from "./sentence/ranges";

interface Wrapper {
	open: string;
	close: string;
}

export const HIGHLIGHT_WRAPPER: Wrapper = { open: "==", close: "==" };
export const BOLD_WRAPPER: Wrapper = { open: "**", close: "**" };
export const BOLD_HIGHLIGHT_WRAPPER: Wrapper = { open: "==**", close: "**==" };

function transformPosition(
	position: EditorPosition,
	line: number,
	range: TextRange,
	wrapper: Wrapper,
	removing: boolean,
): EditorPosition {
	if (position.line !== line) return position;
	if (position.ch < range.from) return position;
	if (position.ch > range.to || (removing && position.ch === range.to)) {
		const delta = wrapper.open.length + wrapper.close.length;
		return { ...position, ch: position.ch + (removing ? -delta : delta) };
	}
	if (removing) {
		return {
			...position,
			ch: Math.max(range.from, position.ch - wrapper.open.length),
		};
	}
	return { ...position, ch: position.ch + wrapper.open.length };
}

function toggleRange(
	editor: Editor,
	line: number,
	range: TextRange,
	wrapper: Wrapper,
): void {
	const text = editor.getLine(line);
	const selected = text.slice(range.from, range.to);
	const removing =
		selected.startsWith(wrapper.open) && selected.endsWith(wrapper.close);
	const replacement = removing
		? selected.slice(wrapper.open.length, selected.length - wrapper.close.length)
		: `${wrapper.open}${selected}${wrapper.close}`;
	const anchor = editor.getCursor("anchor");
	const head = editor.getCursor("head");
	editor.replaceRange(
		replacement,
		{ line, ch: range.from },
		{ line, ch: range.to },
	);
	editor.setSelection(
		transformPosition(anchor, line, range, wrapper, removing),
		transformPosition(head, line, range, wrapper, removing),
	);
}

function enclosingWrapperRange(
	text: string,
	character: number,
	wrapper: Wrapper,
): TextRange | null {
	let searchFrom = 0;
	while (searchFrom < text.length) {
		const open = text.indexOf(wrapper.open, searchFrom);
		if (open === -1) return null;
		const contentStart = open + wrapper.open.length;
		const close = text.indexOf(wrapper.close, contentStart);
		if (close === -1) return null;
		const end = close + wrapper.close.length;
		if (character >= open && character <= end) return { from: open, to: end };
		searchFrom = end;
	}
	return null;
}

export function toggleSentenceFormat(
	editor: Editor,
	pattern: RegExp,
	wrapper: Wrapper,
): void {
	const cursor = editor.getCursor();
	const text = editor.getLine(cursor.line);
	if (text.length === 0) return;
	const sentence =
		enclosingWrapperRange(text, cursor.ch, wrapper) ??
		sentenceAt(text, cursor.ch, pattern);
	if (sentence) toggleRange(editor, cursor.line, sentence, wrapper);
}

export function toggleLineFormat(editor: Editor, wrapper: Wrapper): void {
	const cursor = editor.getCursor();
	const text = editor.getLine(cursor.line);
	if (text.length === 0) return;
	toggleRange(editor, cursor.line, { from: 0, to: text.length }, wrapper);
}
