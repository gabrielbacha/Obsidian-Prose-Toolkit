import type { Editor, EditorPosition } from "obsidian";

export interface TextRange {
	from: number;
	to: number;
}

const LIST_PREFIX = /^\s*(?:[-+*]|\d+\.|>) (?:\[[^\]]\] )?/u;

export function sentenceRanges(text: string, pattern: RegExp): TextRange[] {
	const expression = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
	const ranges: TextRange[] = [];
	let match: RegExpExecArray | null;
	while ((match = expression.exec(text)) !== null) {
		if (match[0].length === 0) {
			expression.lastIndex += 1;
			continue;
		}
		ranges.push({ from: match.index, to: match.index + match[0].length });
	}
	return ranges;
}

export function sentenceAt(
	text: string,
	character: number,
	pattern: RegExp,
): TextRange | null {
	return (
		sentenceRanges(text, pattern).find(
			(range) => character >= range.from && character <= range.to,
		) ?? null
	);
}

export function listPrefixLength(text: string): number {
	return text.match(LIST_PREFIX)?.[0].length ?? 0;
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

