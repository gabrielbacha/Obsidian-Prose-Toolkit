import { markdownContext } from "./markdown-context";

export type HighlightKind = "equals" | "mark" | "bold";
export interface ExtractedHighlight { kind: HighlightKind; content: string; context: string; start: number; end: number }
interface Opening { kind: HighlightKind; start: number; length: number }
interface Scanner { kind: HighlightKind; delimiter?: string; expression?: RegExp; next?: Opening | null; exhausted?: boolean }

/** Process the leftmost eligible opening once; accepted outer spans suppress nested candidates. */
export function extractHighlights(text: string, includeBold: boolean, maximum = Infinity): ExtractedHighlight[] {
	const context = markdownContext(text), accepted: ExtractedHighlight[] = [];
	const scanners: Scanner[] = [
		{ kind: "equals", delimiter: "==" },
		{ kind: "mark", expression: /<mark(?:\s+(?:[^<>"']|"[^"]*"|'[^']*')*)?\s*>/giu },
		...(includeBold ? [{ kind: "bold" as const, delimiter: "**" }] : []),
	];
	const closingMark = /<\/mark\s*>/giu;
	function nextOpening(scanner: Scanner, cursor: number): Opening | null {
		if (scanner.exhausted) return null;
		if (scanner.next && scanner.next.start >= cursor) return scanner.next;
		if (scanner.delimiter) {
			let start = text.indexOf(scanner.delimiter, cursor);
			while (start >= 0) {
				const length = scanner.delimiter.length;
				if (context.eligible(start, length) && !/\s/u.test(text[start + length] ?? "")) {
					scanner.next = { kind: scanner.kind, start, length }; return scanner.next;
				}
				start = text.indexOf(scanner.delimiter, start + length);
			}
		} else {
			const expression = scanner.expression!;
			expression.lastIndex = cursor;
			let match: RegExpExecArray | null;
			while ((match = expression.exec(text)) !== null) {
				if (context.eligible(match.index, 1)) {
					scanner.next = { kind: scanner.kind, start: match.index, length: match[0].length }; return scanner.next;
				}
			}
		}
		scanner.exhausted = true; scanner.next = null; return null;
	}
	let cursor = 0;
	while (cursor < text.length) {
		let selected: { scanner: Scanner; opening: Opening } | null = null;
		for (const scanner of scanners) {
			const opening = nextOpening(scanner, cursor);
			if (opening && (!selected || opening.start < selected.opening.start)) selected = { scanner, opening };
		}
		if (!selected) break;
		const { scanner, opening } = selected, contentStart = opening.start + opening.length;
		let close = -1, closeLength = 0;
		if (scanner.delimiter) {
			closeLength = scanner.delimiter.length;
			close = text.indexOf(scanner.delimiter, contentStart);
			while (close >= 0 && (!context.eligible(close, closeLength) || /\s/u.test(text[close - 1] ?? ""))) close = text.indexOf(scanner.delimiter, close + closeLength);
		} else {
			closingMark.lastIndex = contentStart;
			let match: RegExpExecArray | null;
			while ((match = closingMark.exec(text)) !== null) {
				if (context.eligible(match.index, 1)) { close = match.index; closeLength = match[0].length; break; }
			}
		}
		scanner.next = null;
		if (close < 0 || !context.sameBlock(opening.start, close + closeLength)) { cursor = contentStart; continue; }
		const end = close + closeLength, content = text.slice(contentStart, close).replace(/\s+/gu, " ").trim();
		if (content) {
			if (accepted.length >= maximum) throw new Error("This note has too many highlights. Split it first.");
			accepted.push({ kind: opening.kind, content, context: context.context(opening.start, end), start: opening.start, end });
		}
		cursor = end;
	}
	return accepted;
}
