// @vitest-environment node
import { Worker as NodeWorker } from "node:worker_threads";
import { afterEach, describe, expect, it } from "vitest";
import { TextWorkerClient, type LocalWorker } from "../src/text-worker-client";
import { DEFAULT_SENTENCE_REGEX } from "../src/settings";

const clients: TextWorkerClient[] = [], exits: Promise<void>[] = [];
function client(timeoutMs = 1500) {
	const value = new TextWorkerClient({
		timeoutMs,
		timers: { set: (callback, ms) => setTimeout(callback, ms), clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>) },
		createWorker(source) {
			const bridge = "const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;globalThis.postMessage=data=>parentPort.postMessage(data);parentPort.on('message',data=>globalThis.onmessage({data}));";
			const native = new NodeWorker(bridge + source, { eval: true });
			exits.push(new Promise<void>((resolve) => native.once("exit", () => resolve())));
			const adapter: LocalWorker = { onmessage: null, onerror: null, postMessage: (data) => native.postMessage(data), terminate: () => { void native.terminate(); } };
			native.on("message", (data: unknown) => adapter.onmessage?.({ data }));
			native.on("error", (error) => adapter.onerror?.({ message: error.message }));
			return adapter;
		},
	});
	clients.push(value); return value;
}
afterEach(async () => { for (const value of clients.splice(0)) value.dispose(); await Promise.all(exits.splice(0)); });
describe("actual compiled local text worker", () => {
	it("keeps changed patterns separate and stops at the requested sentence", async () => {
		const worker = client();
		expect(await worker.sentences("[a-z]+", [{ text: "one TWO", until: 3 }])).toEqual([[{ from: 0, to: 3 }]]);
		expect(await worker.sentences("[A-Z]+", [{ text: "one TWO", until: 7 }])).toEqual([[{ from: 4, to: 7 }]]);
		expect(await worker.sentences("[a-z]+", [{ text: "one TWO", until: 3 }])).toEqual([[{ from: 0, to: 3 }]]);
		const rows = await worker.sentences(DEFAULT_SENTENCE_REGEX, [{ text: "- First. " + "Later. ".repeat(10000), until: 5 }]);
		expect(rows).toEqual([[{ from: 2, to: 8 }]]);
	});
	it("terminates a pathological regex while the parent event loop remains responsive", async () => {
		const worker = client(180); let ticks = 0;
		const heartbeat = setInterval(() => { ticks++; }, 5);
		try {
			await expect(worker.sentences("(a+)+$", [{ text: "a".repeat(60000) + "!", until: 60001 }])).rejects.toThrow(/took too long/);
			expect(ticks).toBeGreaterThan(5);
			expect(await worker.sentences("[a-z]+", [{ text: "ready", until: 5 }])).toEqual([[{ from: 0, to: 5 }]]);
		} finally { clearInterval(heartbeat); }
	});
	it("cancels its owned worker and can start a fresh operation", async () => {
		const worker = client(3000);
		const pending = worker.sentences("(a+)+$", [{ text: "a".repeat(60000) + "!", until: 60001 }]);
		const refusal = expect(pending).rejects.toThrow(/cancelled/);
		worker.cancel(); await refusal;
		expect(await worker.sentences("[a-z]+", [{ text: "ready", until: 5 }])).toEqual([[{ from: 0, to: 5 }]]);
	});
	it("returns complete bounded extraction with shared contextual text", async () => {
		const worker = client(3000), text = Array.from({ length: 1500 }, (_, index) => "==item " + index + "==").join(" ");
		const highlights = await worker.extract(text, false);
		expect(highlights).toHaveLength(1500); expect(highlights[1499].content).toBe("item 1499");
		expect(highlights[0].context).toBe(text); expect(highlights[1499].context).toBe(text);
		await expect(worker.extract("==point== ".repeat(10001), false)).rejects.toThrow(/too many highlights/);
	});
});

describe("late worker ownership", () => {
	it("does not let an old worker complete or cancel a new request", async () => {
		const workers: Array<LocalWorker & { request?: { id: string } }> = [];
		const value = new TextWorkerClient({
			timers: { set: (callback, ms) => setTimeout(callback, ms), clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>) },
			createWorker() {
				const worker: LocalWorker & { request?: { id: string } } = { onmessage: null, onerror: null, terminate: () => {}, postMessage: (data) => { worker.request = data as { id: string }; } };
				workers.push(worker); return worker;
			},
		});
		clients.push(value);
		const first = value.sentences("[a-z]+", [{ text: "first", until: 5 }]);
		const refused = expect(first).rejects.toThrow(/cancelled/); value.cancel(); await refused;
		const next = value.sentences("[a-z]+", [{ text: "next", until: 4 }]), id = workers[1].request!.id;
		workers[0].onmessage?.({ data: { id, ok: true, result: [[{ from: 999, to: 1000 }]] } });
		workers[0].onerror?.({ message: "late failure" });
		workers[1].onmessage?.({ data: { id, ok: true, result: [[{ from: 0, to: 4 }]] } });
		expect(await next).toEqual([[{ from: 0, to: 4 }]]);
	});
});
