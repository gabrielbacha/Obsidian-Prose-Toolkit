/** Source offsets remain unchanged while Markdown code and block boundaries are excluded. */
export function markdownContext(text: string) {
	const protectedBytes = new Uint8Array(text.length);
	const boundaries = new Set<number>();
	const lineStarts = [0];
	const contexts = new Map<string, string>();
	const tick = String.fromCharCode(96);
	const escaped = (index: number) => {
		let slashes = 0;
		while (index > 0 && text[--index] === "\\") slashes++;
		return slashes % 2 === 1;
	};
	const protect = (from: number, to: number) => protectedBytes.fill(1, from, to);
	let fence: { character: string; length: number } | null = null;
	let frontmatter = text.startsWith("---\n") || text.startsWith("---\r\n");
	for (let start = 0; start < text.length;) {
		const newline = text.indexOf("\n", start), end = newline < 0 ? text.length : newline + 1;
		const line = text.slice(start, end).replace(/[\r\n]+$/u, "");
		if (newline >= 0) lineStarts.push(end);
		if (frontmatter) {
			protect(start, end);
			if (start > 0 && /^(?:---|\.\.\.)[ \t]*$/u.test(line)) { frontmatter = false; boundaries.add(end); }
		} else {
			const trimmed = line.replace(/^ {0,3}/u, "");
			let run = 0;
			const character = trimmed[0];
			if (character === tick || character === "~") while (trimmed[run] === character) run++;
			if (fence) {
				protect(start, end);
				if (character === fence.character && run >= fence.length && trimmed.slice(run).trim() === "") { fence = null; boundaries.add(end); }
			} else if (run >= 3) {
				fence = { character, length: run }; protect(start, end); boundaries.add(start);
			} else if (/^(?: {4}|\t)/u.test(line)) {
				protect(start, end); boundaries.add(start); boundaries.add(end);
			} else if (/^[ \t]*$/u.test(line)) {
				boundaries.add(start); boundaries.add(end);
			} else if (/^ {0,3}(?:#{1,6}[ \t]+|(?:[-+*]|\d+[.)])[ \t]+|(?:[-*_][ \t]*){3,}$)/u.test(line)) {
				boundaries.add(start);
			}
		}
		start = end;
	}
	for (let cursor = 0; cursor < text.length;) {
		const start = text.indexOf("<!--", cursor);
		if (start < 0) break;
		const close = text.indexOf("-->", start + 4), end = close < 0 ? text.length : close + 3;
		if (!escaped(start)) protect(start, end);
		cursor = end;
	}
	// Attributes are syntax, not prose. Mark tag delimiters remain visible to the mark scanner.
	const tags = /<\/?[A-Za-z][A-Za-z0-9:-]*(?:\s+(?:[^<>"']|"[^"]*"|'[^']*')*)?\s*\/?>/gu;
	let tag: RegExpExecArray | null;
	while ((tag = tags.exec(text)) !== null) {
		if (escaped(tag.index)) continue;
		protect(tag.index + (/^<\/?mark(?:\s|>)/iu.test(tag[0]) ? 1 : 0), tag.index + tag[0].length);
	}
	const sortedBoundaries = [...boundaries].sort((left, right) => left - right);
	function upperBound(values: number[], position: number): number {
		let low = 0, high = values.length;
		while (low < high) {
			const middle = (low + high) >>> 1;
			if (values[middle] <= position) low = middle + 1; else high = middle;
		}
		return low;
	}
	function sameBlock(start: number, end: number) {
		const next = sortedBoundaries[upperBound(sortedBoundaries, start)];
		return next === undefined || next >= end;
	}
	for (let cursor = 0; cursor < text.length;) {
		const start = text.indexOf(tick, cursor);
		if (start < 0) break;
		let length = 1;
		while (text[start + length] === tick) length++;
		cursor = start + length;
		if (protectedBytes[start] || escaped(start)) continue;
		let search = cursor;
		while (search < text.length) {
			const close = text.indexOf(tick, search);
			if (close < 0 || !sameBlock(start, close + 1)) break;
			let closingLength = 1;
			while (text[close + closingLength] === tick) closingLength++;
			search = close + closingLength;
			if (closingLength === length) { protect(start, search); cursor = search; break; }
		}
	}
	return {
		sameBlock,
		eligible(index: number, length: number) {
			if (escaped(index)) return false;
			for (let offset = 0; offset < length; offset++) if (protectedBytes[index + offset]) return false;
			return true;
		},
		context(start: number, end: number) {
			const from = lineStarts[Math.max(0, upperBound(lineStarts, start) - 1)];
			const endLine = upperBound(lineStarts, Math.max(start, end - 1));
			const to = endLine < lineStarts.length ? lineStarts[endLine] - 1 : text.length;
			const key = from + ":" + to;
			let value = contexts.get(key);
			if (value === undefined) { value = text.slice(from, to).replace(/\s+/gu, " ").trim(); contexts.set(key, value); }
			return value;
		},
	};
}
