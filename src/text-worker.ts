import { extractHighlights } from "./extraction/parser";
import { listPrefixLength, type TextRange } from "./sentence/ranges";

const patterns = new Map<string, RegExp>();
const scope = self as unknown as { onmessage: ((event: { data: Request }) => void) | null; postMessage(data: unknown): void };
interface Request { id: string; kind: "sentences" | "extract"; source?: string; lines?: Array<{ text: string; until: number }>; text?: string; bold?: boolean }
function pattern(source: string) {
	if (source.length > 4096) throw new Error("Sentence expressions are limited to 4,096 characters.");
	let value = patterns.get(source);
	if (!value) {
		value = new RegExp(source, "gm"); patterns.set(source, value);
		if (patterns.size > 8) { const oldest = Array.from(patterns.keys())[0]; if (oldest !== undefined) patterns.delete(oldest); };
	}
	value.lastIndex = 0; return value;
}
scope.onmessage = ({ data }) => {
	try {
		let result: unknown;
		if (data.kind === "sentences") {
			result = (data.lines ?? []).map(({ text, until }) => {
				if (text.length > 1_000_000) throw new Error("This line is too large for sentence editing. Split it first.");
				const offset = listPrefixLength(text), prose = text.slice(offset), expression = pattern(data.source ?? "");
				const ranges: TextRange[] = [];
				let match: RegExpExecArray | null;
				while ((match = expression.exec(prose)) !== null) {
					if (!match[0].length) { expression.lastIndex++; continue; }
					const range = { from: offset + match.index, to: offset + match.index + match[0].length };
					ranges.push(range);
					if (ranges.length > 10000) throw new Error("The expression matches too many ranges.");
					if (range.to >= until) break;
				}
				return ranges;
			});
		} else {
			const text = data.text ?? "";
			if (text.length > 8_000_000) throw new Error("This note is too large to extract. Split it first.");
			const highlights = extractHighlights(text, data.bold === true, 10000);
			if (highlights.length > 10000) throw new Error("This note has more than 10,000 highlights.");
			const contexts: string[] = [], indexes = new Map<string, number>();
			let bytes = 0;
			const items = highlights.map((item) => {
				let context = indexes.get(item.context);
				if (context === undefined) {
					context = contexts.length; indexes.set(item.context, context); contexts.push(item.context); bytes += item.context.length;
				}
				bytes += item.content.length;
				if (bytes > 32_000_000) throw new Error("Extraction output is too large. Split the note first.");
				return { kind: item.kind, content: item.content, start: item.start, end: item.end, context };
			});
			result = { contexts, items };
		}
		scope.postMessage({ id: data.id, ok: true, result });
	} catch (error) { scope.postMessage({ id: data.id, ok: false, error: error instanceof Error ? error.message : "Text processing failed." }); }
};
scope.postMessage({ ready: true });
