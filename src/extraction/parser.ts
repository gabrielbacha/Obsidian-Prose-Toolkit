export type HighlightKind = "equals" | "mark" | "bold";

export interface ExtractedHighlight {
	kind: HighlightKind;
	content: string;
	context: string;
	start: number;
	end: number;
}

interface Candidate extends ExtractedHighlight {
	priority: number;
}

function normalizeWhitespace(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function contextFor(text: string, start: number, end: number): string {
	const lineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
	const nextBreak = text.indexOf("\n", end);
	const lineEnd = nextBreak === -1 ? text.length : nextBreak;
	return normalizeWhitespace(text.slice(lineStart, lineEnd));
}

function scanSymmetricDelimiter(
	text: string,
	delimiter: string,
	kind: HighlightKind,
	priority: number,
): Candidate[] {
	const candidates: Candidate[] = [];
	let cursor = 0;
	while (cursor < text.length) {
		const start = text.indexOf(delimiter, cursor);
		if (start === -1) break;
		const contentStart = start + delimiter.length;
		const close = text.indexOf(delimiter, contentStart);
		if (close === -1) break;
		const end = close + delimiter.length;
		const content = normalizeWhitespace(text.slice(contentStart, close));
		if (content.length > 0) {
			candidates.push({
				kind,
				content,
				context: contextFor(text, start, end),
				start,
				end,
				priority,
			});
		}
		cursor = end;
	}
	return candidates;
}

function scanMarkTags(text: string): Candidate[] {
	const candidates: Candidate[] = [];
	const opening = /<mark(?:\s[^>]*)?>/giu;
	const closing = /<\/mark\s*>/giu;
	let match: RegExpExecArray | null;
	while ((match = opening.exec(text)) !== null) {
		closing.lastIndex = match.index + match[0].length;
		const close = closing.exec(text);
		if (!close) continue;
		const start = match.index;
		const end = close.index + close[0].length;
		const content = normalizeWhitespace(
			text.slice(match.index + match[0].length, close.index),
		);
		if (content.length > 0) {
			candidates.push({
				kind: "mark",
				content,
				context: contextFor(text, start, end),
				start,
				end,
				priority: 0,
			});
		}
		opening.lastIndex = end;
	}
	return candidates;
}

export function extractHighlights(
	text: string,
	includeBold: boolean,
): ExtractedHighlight[] {
	const candidates = [
		...scanSymmetricDelimiter(text, "==", "equals", 0),
		...scanMarkTags(text),
		...(includeBold
			? scanSymmetricDelimiter(text, "**", "bold", 1)
			: []),
	].sort((left, right) => {
		if (left.start !== right.start) return left.start - right.start;
		if (left.priority !== right.priority) return left.priority - right.priority;
		return right.end - left.end;
	});

	const accepted: ExtractedHighlight[] = [];
	let occupiedUntil = -1;
	for (const candidate of candidates) {
		if (candidate.start < occupiedUntil) continue;
		accepted.push({
			kind: candidate.kind,
			content: candidate.content,
			context: candidate.context,
			start: candidate.start,
			end: candidate.end,
		});
		occupiedUntil = candidate.end;
	}
	return accepted;
}
