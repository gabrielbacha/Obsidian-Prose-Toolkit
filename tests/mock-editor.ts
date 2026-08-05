import type { Editor, EditorPosition } from "obsidian";

export class MockEditor {
	private lines: string[];
	private anchor: EditorPosition;
	private head: EditorPosition;

	constructor(value: string, cursor: EditorPosition = { line: 0, ch: 0 }) {
		this.lines = value.split("\n");
		this.anchor = { ...cursor };
		this.head = { ...cursor };
	}

	asEditor(): Editor {
		return this as unknown as Editor;
	}

	getValue(): string {
		return this.lines.join("\n");
	}

	getLine(line: number): string {
		return this.lines[line] ?? "";
	}

	lineCount(): number {
		return this.lines.length;
	}

	getCursor(which?: "from" | "to" | "head" | "anchor"): EditorPosition {
		if (which === "anchor" || which === "from") return { ...this.anchor };
		return { ...this.head };
	}

	setCursor(position: EditorPosition): void {
		this.anchor = { ...position };
		this.head = { ...position };
	}

	setSelection(anchor: EditorPosition, head: EditorPosition): void {
		this.anchor = { ...anchor };
		this.head = { ...head };
	}

	getSelection(): string {
		if (this.anchor.line !== this.head.line) return "";
		const from = Math.min(this.anchor.ch, this.head.ch);
		const to = Math.max(this.anchor.ch, this.head.ch);
		return this.getLine(this.anchor.line).slice(from, to);
	}

	replaceRange(
		replacement: string,
		from: EditorPosition,
		to: EditorPosition = from,
	): void {
		if (from.line !== to.line) throw new Error("MockEditor supports same-line edits only");
		const line = this.getLine(from.line);
		this.lines[from.line] = line.slice(0, from.ch) + replacement + line.slice(to.ch);
	}
}

