import workerSource from "prose-toolkit:worker";
import { localId } from "./local-id";
import type { ExtractedHighlight } from "./extraction/parser";
import type { TextRange } from "./sentence/ranges";

export interface LocalWorker {
	onmessage: ((event: { data: unknown }) => void) | null;
	onerror: ((event: { message: string; preventDefault?: () => void }) => void) | null;
	postMessage(data: unknown): void;
	terminate(): void;
}
export class TextCancelledError extends Error {}
export class TextWorkerClient {
	private worker: LocalWorker | null = null;
	private url: string | null = null;
	private active: { id: string; resolve: (data: unknown) => void; reject: (error: Error) => void; timer: unknown } | null = null;
	private idle: unknown = null;
	constructor(private options: { createWorker?: (source: string) => LocalWorker; timeoutMs?: number; timers?: { set(callback: () => void, ms: number): unknown; clear(handle: unknown): void } } = {}) {}
	cancel(message = "Text operation cancelled.") {
		if (this.active) { this.timers().clear(this.active.timer); this.active.reject(new TextCancelledError(message)); this.active = null; }
		this.stop();
	}
	private timers() { return this.options.timers ?? { set: (callback: () => void, ms: number) => window.setTimeout(callback, ms), clear: (handle: unknown) => window.clearTimeout(handle as number) }; }
	private stop() {
		if (this.idle) this.timers().clear(this.idle); this.idle = null;
		this.worker?.terminate(); this.worker = null;
		if (this.url) URL.revokeObjectURL(this.url); this.url = null;
	}
	private ensure() {
		if (this.worker) return this.worker;
		let worker: LocalWorker;
		if (this.options.createWorker) worker = this.options.createWorker(workerSource);
		else {
			this.url = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
			const native = new Worker(this.url);
			worker = { onmessage: null, onerror: null, postMessage: (data) => native.postMessage(data), terminate: () => native.terminate() };
			native.onmessage = (event) => worker.onmessage?.({ data: event.data });
			native.onerror = (event) => worker.onerror?.({ message: event.message, preventDefault: () => event.preventDefault() });
		}
		this.worker = worker;
		worker.onmessage = ({ data }) => {
			if (this.worker !== worker) return;
			const message = data as { ready?: boolean; id?: string; ok?: boolean; result?: unknown; error?: string };
			if (message.ready && this.url) { URL.revokeObjectURL(this.url); this.url = null; }
			if (!this.active || message.id !== this.active.id) return;
			const current = this.active; this.active = null; this.timers().clear(current.timer);
			if (message.ok === true) current.resolve(message.result); else current.reject(new Error(message.error ?? "Text processing failed."));
			this.idle = this.timers().set(() => this.stop(), 30000);
		};
		worker.onerror = (event) => { event.preventDefault?.(); if (this.worker !== worker) return; this.cancel(event.message || "The local text worker could not start."); };
		return worker;
	}
	private run(request: Record<string, unknown>): Promise<unknown> {
		if (this.active) this.cancel("A newer text operation replaced this one.");
		if (this.idle) this.timers().clear(this.idle); this.idle = null;
		return new Promise((resolve, reject) => {
			const id = localId();
			try {
				const worker = this.ensure();
				this.active = { id, resolve, reject, timer: this.timers().set(() => this.cancel("Text processing took too long. No editor change was applied."), this.options.timeoutMs ?? 1500) };
				worker.postMessage({ ...request, id });
			} catch (error) { if (this.active) { this.timers().clear(this.active.timer); this.active = null; } this.stop(); reject(error instanceof Error ? error : new Error("The local worker could not start.")); }
		});
	}
	async sentences(source: string, lines: Array<{ text: string; until: number }>): Promise<TextRange[][]> {
		return await this.run({ kind: "sentences", source, lines }) as TextRange[][];
	}
	async extract(text: string, bold: boolean): Promise<ExtractedHighlight[]> {
		const packed = await this.run({ kind: "extract", text, bold }) as { contexts: string[]; items: Array<Omit<ExtractedHighlight, "context"> & { context: number }> };
		return packed.items.map((item) => ({ ...item, context: packed.contexts[item.context] }));
	}
	dispose() { this.cancel(); }
}
