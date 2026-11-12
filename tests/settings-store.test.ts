import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/settings";
import { publishSettings, restoreDefaultSettings, type SettingsFiles } from "../src/settings-store";

function decode(raw: string): Record<string, unknown> { return JSON.parse(raw) as Record<string, unknown>; }
function fixture(raw: string | null = JSON.stringify(DEFAULT_SETTINGS)) {
	const data = new Map<string, string>(); if (raw !== null) data.set("data.json", raw);
	const files: SettingsFiles = {
		exists: async (path) => data.has(path),
		read: async (path) => { if (!data.has(path)) throw new Error("missing"); return data.get(path)!; },
		write: async (path, value) => { data.set(path, value); },
		copy: async (source, target) => { if (data.has(target)) throw new Error("exists"); data.set(target, data.get(source)!); },
		remove: async (path) => { data.delete(path); },
		process: async (path, edit) => { const result = edit(data.get(path)!); data.set(path, result); return result; },
	};
	return { data, files };
}
describe("settings publication", () => {
	it("does not write unchanged settings and creates a missing target without overwriting", async () => {
		const { files, data } = fixture(null);
		await publishSettings(files, "data.json", null, DEFAULT_SETTINGS);
		expect(data.size).toBe(0);
		await publishSettings(files, "data.json", null, { ...DEFAULT_SETTINGS, createNewFile: true });
		expect(decode(data.get("data.json")!).createNewFile).toBe(true);
		expect([...data.keys()].filter((path) => path.includes("recovery"))).toHaveLength(1);
	});
	it("merges independent current changes and preserves unknown properties", async () => {
		const { files, data } = fixture(JSON.stringify({ ...DEFAULT_SETTINGS, headlineText: "other writer", extension: { preserved: true } }));
		await publishSettings(files, "data.json", DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, createNewFile: true });
		const saved = decode(data.get("data.json")!);
		expect(saved.headlineText).toBe("other writer"); expect(saved.extension).toEqual({ preserved: true }); expect(saved.createNewFile).toBe(true);
	});
	it("refuses an overlapping edit and keeps both the current file and prepared draft", async () => {
		const original = JSON.stringify({ ...DEFAULT_SETTINGS, headlineText: "other writer" }), { files, data } = fixture(original);
		await expect(publishSettings(files, "data.json", DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, headlineText: "my draft" })).rejects.toThrow(/another vault instance/);
		expect(data.get("data.json")).toBe(original);
		const recovery = [...data.entries()].find(([path]) => path.includes("recovery"))![1];
		expect((decode(recovery).intended as { headlineText: string }).headlineText).toBe("my draft");
	});
	it("freezes the request before delayed recovery writes", async () => {
		const { files, data } = fixture(), original = { ...files };
		let release!: () => void;
		files.write = async (path, value) => { await new Promise<void>((resolve) => { release = resolve; }); await original.write(path, value); };
		const draft = { ...DEFAULT_SETTINGS, headlineText: "first" }, pending = publishSettings(files, "data.json", DEFAULT_SETTINGS, draft);
		while (!release) await Promise.resolve();
		draft.headlineText = "later"; release();
		await pending; expect(decode(data.get("data.json")!).headlineText).toBe("first");
	});
	it("confirms a durable process write after a lost response", async () => {
		const { files, data } = fixture(), original = { ...files };
		files.process = async (path, edit) => { await original.process(path, edit); throw new Error("response lost"); };
		const result = await publishSettings(files, "data.json", DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, createNewFile: true });
		expect(result.settings.createNewFile).toBe(true); expect(decode(data.get("data.json")!).createNewFile).toBe(true);
	});
	it("refuses future data and preserves exact invalid bytes before explicit recovery", async () => {
		const raw = "{ invalid original bytes", { files, data } = fixture(raw);
		await expect(publishSettings(files, "data.json", null, { ...DEFAULT_SETTINGS, createNewFile: true })).rejects.toThrow();
		expect(data.size).toBe(1);
		const recovered = await restoreDefaultSettings(files, "data.json");
		expect(decode(data.get(recovered.recoveryPath)!).original).toBe(raw);
		expect(recovered.settings).toEqual(DEFAULT_SETTINGS);
	});
	it("refuses replacement data that changes during recovery", async () => {
		const { files, data } = fixture("bad data"), original = { ...files };
		files.process = async (path, edit) => { data.set(path, "newer data"); return original.process(path, edit); };
		await expect(restoreDefaultSettings(files, "data.json")).rejects.toThrow(/changed during recovery/);
		expect(data.get("data.json")).toBe("newer data");
	});
	it("does not publish when the owner closes while recovery is being prepared", async () => {
		const { files, data } = fixture(), original = { ...files }; let alive = true;
		files.write = async (path, value) => { await original.write(path, value); alive = false; };
		await expect(publishSettings(files, "data.json", DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, createNewFile: true }, () => alive)).rejects.toThrow(/owner closed/);
		expect(decode(data.get("data.json")!).createNewFile).toBe(false);
	});
});

describe("settings recovery selection", () => {
	it("refuses a changed file before preparing recovery or replacing it", async () => {
		const { files, data } = fixture("newer settings");
		await expect(restoreDefaultSettings(files, "data.json", () => true, "selected settings")).rejects.toThrow(/after recovery was selected/);
		expect([...data.entries()]).toEqual([["data.json", "newer settings"]]);
	});
});
