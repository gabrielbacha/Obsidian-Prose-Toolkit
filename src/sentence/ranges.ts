import type { Editor, EditorPosition } from "obsidian";

export interface TextRange {
	from: number;
	to: number;
}

const LIST_PREFIX = /^[ \t]*(?:>[ \t]?|(?:[-+*]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?)/u;

// Execution caches are keyed by source/flags and never mutate the caller RegExp.
const cachedMatchers = new Map<string, RegExp>();

export type SentencePattern = RegExp | { ranges: Map<string, TextRange[]> };

export function sentenceRanges(text: string, pattern: SentencePattern): TextRange[] {
	if (!(pattern instanceof RegExp)) {
		const ranges = pattern.ranges.get(text);
		if (!ranges) throw new Error("The editor line changed during sentence processing.");
		return ranges;
	}
	const flags = pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g";
	const key = JSON.stringify([pattern.source, flags]);
	let expression = cachedMatchers.get(key);
	if (!expression) {
		expression = new RegExp(pattern.source, flags); cachedMatchers.set(key, expression);
		if (cachedMatchers.size > 8) { const oldest = Array.from(cachedMatchers.keys())[0]; if (oldest !== undefined) cachedMatchers.delete(oldest); }
	}
	expression.lastIndex = 0;
	const offset = listPrefixLength(text);
	const prose = text.slice(offset);
	const ranges: TextRange[] = [];
	let match: RegExpExecArray | null;
	while ((match = expression.exec(prose)) !== null) {
		if (match[0].length === 0) {
			expression.lastIndex += 1;
			continue;
		}
		ranges.push({ from: offset + match.index, to: offset + match.index + match[0].length });
	}
	return ranges;
}

export function sentenceAt(
	text: string,
	character: number,
	pattern: SentencePattern,
): TextRange | null {
	const cursor = Math.max(listPrefixLength(text), character);
	return (
		sentenceRanges(text, pattern).find(
			(range) => cursor >= range.from && cursor <= range.to,
		) ?? null
	);
}

export function listPrefixLength(text: string): number {
	let offset = 0;
	let match: RegExpMatchArray | null;
	while ((match = text.slice(offset).match(LIST_PREFIX)) !== null) offset += match[0].length;
	return offset;
}

export function previousNonEmptyLine(editor: Editor, line: number): number {
	let candidate = Math.max(0, line - 1);
	while (candidate > 0 && editor.getLine(candidate).trim().length === 0) {
		candidate -= 1;
	}
	return candidate;
}

export function nextNonEmptyLine(editor: Editor, line: number): number {
	let candidate = Math.min(editor.lineCount() - 1, line + 1);
	while (
		candidate < editor.lineCount() - 1 &&
		editor.getLine(candidate).trim().length === 0
	) {
		candidate += 1;
	}
	return candidate;
}

export function linePosition(line: number, ch: number): EditorPosition {
	return { line, ch };
}

