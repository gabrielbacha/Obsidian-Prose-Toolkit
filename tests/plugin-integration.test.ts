import { MockEditor } from "./mock-editor";
import { selectSentence } from "../src/sentence/actions";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface RegisteredCommand {
	id: string;
	name: string;
	hotkeys?: Array<{ modifiers: string[]; key: string }>;
}

const mockState = vi.hoisted(
	(): {
		app: unknown;
		loadedData: unknown;
		savedData: unknown[];
		commands: RegisteredCommand[];
		notices: string[];
		ribbonIcons: string[];
		settingTabs: unknown[];
	} => ({
		app: null,
		loadedData: null,
		savedData: [],
		commands: [],
		notices: [],
		ribbonIcons: [],
		settingTabs: [],
	}),
);

vi.mock("obsidian", () => {
	class Plugin {
		manifest = { id: "prose-toolkit" };
		app = mockState.app;
		async loadData() {
			return mockState.loadedData;
		}
		async saveData(value: unknown) {
			mockState.savedData.push(value);
		}
		addCommand(command: RegisteredCommand) {
			mockState.commands.push(command);
			return command;
		}
		addSettingTab(tab: unknown) {
			mockState.settingTabs.push(tab);
		}
		addRibbonIcon(icon: string) {
			mockState.ribbonIcons.push(icon);
			return document.createElement("div");
		}
	}

	class PluginSettingTab {
		app: unknown;
		containerEl = document.createElement("div");
		updateCalls = 0;
		constructor(app: unknown) {
			this.app = app;
		}
		update() {
			this.updateCalls += 1;
		}
	}

	class Setting {
		constructor() {}
	}

	return {
		Plugin,
		PluginSettingTab,
		Modal: class Modal {
			contentEl = Object.assign(document.createElement("div"), {
				createEl: (tag: string, options?: { text?: string }) => { const element = document.createElement(tag); element.textContent = options?.text ?? ""; this.contentEl.appendChild(element); return element; },
			});
			setTitle(title: string) { this.contentEl.setAttribute("aria-label", title); }
			open() { document.body.appendChild(this.contentEl); }
			close() { this.contentEl.remove(); }
		},
		Setting,
		MarkdownView: class MarkdownView {},
		Notice: class Notice {
			constructor(message: string) {
				mockState.notices.push(message);
			}
		},
		normalizePath: (path: string) => path,
	};
});

import ProseToolkitPlugin from "../src/main";
import { TextWorkerClient } from "../src/text-worker-client";
import { extractHighlights } from "../src/extraction/parser";

function createApp(activeView: unknown = null) {
	const files = new Map<string, string>(), settingsFiles = new Map<string, string>();
	const configDir = "fixture-config", settingsPath = configDir + "/plugins/prose-toolkit/data.json";
	const exists = (path: string) => settingsFiles.has(path) || files.has(path) || (path === settingsPath && mockState.loadedData !== null);
	const read = (path: string): string => {
		if (settingsFiles.has(path)) return settingsFiles.get(path)!;
		if (files.has(path)) return files.get(path)!;
		if (path === settingsPath && mockState.loadedData !== null) return JSON.stringify(mockState.loadedData);
		throw new Error("missing file");
	};
	return {
		settingsFiles,
		files,
		app: {
			workspace: {
				getActiveViewOfType: () => activeView,
				openLinkText: vi.fn(async () => {}),
			},
			vault: {
				configDir,
				adapter: {
					exists: async (path: string) => exists(path),
					read: async (path: string) => read(path),
					write: async (path: string, data: string) => { settingsFiles.set(path, data); },
					copy: async (source: string, target: string) => { if (exists(target)) throw new Error("exists"); settingsFiles.set(target, read(source)); },
					remove: async (path: string) => { settingsFiles.delete(path); },
					process: async (path: string, edit: (data: string) => string) => { const result = edit(read(path)); settingsFiles.set(path, result); mockState.savedData.push(JSON.parse(result)); return result; },
				},
				getAbstractFileByPath: (path: string) =>
					files.has(path) ? { path } : null,
				create: vi.fn(async (path: string, contents: string) => {
					if (files.has(path)) throw new Error("exists");
					files.set(path, contents);
				}),
			},
		},
	};
}

describe("plugin integration", () => {
	beforeEach(() => {
		mockState.loadedData = null;
		mockState.savedData.length = 0;
		mockState.commands.length = 0;
		mockState.notices.length = 0;
		mockState.ribbonIcons.length = 0;
		mockState.settingTabs.length = 0;
	});

	it("loads and registers the complete stable command surface", async () => {
		const context = createApp();
		mockState.app = context.app;
		const plugin = new ProseToolkitPlugin(context.app as never, {} as never);
		await plugin.onload();

		expect(mockState.commands.map((command) => command.id)).toEqual([
			"shortcut-extract-highlights",
			"shortcut-highlight-sentence",
			"shortcut-bold-sentence",
			"shortcut-bold-highlight-sentence",
			"shortcut-bold-highlight-paragraph",
			"backward-delete-sentence",
			"forward-delete-sentence",
			"backward-select-sentence",
			"forward-select-sentence",
			"move-start-current-sentence",
			"move-start-next-sentence",
			"select-sentence",
			"select-paragraph",
			"cancel-text-operation",
		]);
		expect(mockState.commands[0].hotkeys).toBeUndefined();
		expect(mockState.commands.slice(1, 7).every((command) => command.hotkeys)).toBe(
			true,
		);
		expect(mockState.commands.slice(7, 11).every((command) => !command.hotkeys)).toBe(
			true,
		);
		expect(mockState.commands[11].hotkeys).toEqual([
			{ modifiers: ["Mod"], key: "R" },
		]);
		expect(mockState.commands[12].hotkeys).toEqual([
			{ modifiers: ["Mod"], key: "G" },
		]);
		expect(mockState.ribbonIcons).toEqual(["highlighter"]);
		expect(mockState.settingTabs).toHaveLength(1);
		expect(mockState.savedData).toHaveLength(0);
	});

	it("does not rewrite unchanged or unsupported saved settings during startup", async () => {
		for (const data of [{ createNewFile: false }, { schemaVersion: 99, createNewFile: true }, [true], { createNewFile: "true" }]) {
			const context = createApp(); mockState.app = context.app; mockState.loadedData = data;
			const plugin = new ProseToolkitPlugin(context.app as never, {} as never);
			await plugin.onload();
			expect(mockState.savedData).toHaveLength(0);
			expect(plugin.settings.createNewFile).toBe(false);
		}
	});

	it("provides searchable declarative settings with live dependency rules", async () => {
		const context = createApp();
		mockState.app = context.app;
		const plugin = new ProseToolkitPlugin(context.app as never, {} as never);
		await plugin.onload();
		const settingTab = mockState.settingTabs[0] as {
			getSettingDefinitions(): Array<{
				heading?: string;
				items?: Array<{
					name: string;
					control?: { disabled?: boolean | (() => boolean) };
				}>;
			}>;
			setControlValue(key: string, value: unknown): Promise<void>;
			updateCalls: number;
		};
		const definitions = settingTab.getSettingDefinitions();

		expect(definitions.map((definition) => definition.heading)).toEqual([
			"About and feedback",
			"Sentence navigation",
			"Highlight extraction",
			"Exploded notes",
		]);
		const explodeControl = definitions[3].items?.[0].control;
		expect(
			typeof explodeControl?.disabled === "function" && explodeControl.disabled(),
		).toBe(true);

		await settingTab.setControlValue("createLinks", true);
		await settingTab.setControlValue("createNewFile", true);
		expect(plugin.settings.createLinks).toBe(true);
		expect(plugin.settings.createNewFile).toBe(true);
		expect(
			typeof explodeControl?.disabled === "function" && explodeControl.disabled(),
		).toBe(false);
		expect(settingTab.updateCalls).toBe(2);
	});

	it("reports a missing Markdown view without touching the vault", async () => {
		const context = createApp();
		mockState.app = context.app;
		const plugin = new ProseToolkitPlugin(context.app as never, {} as never);
		await plugin.onload();
		await plugin.extractActiveNote();
		expect(mockState.notices).toEqual([
			"Open a Markdown note before extracting highlights.",
		]);
		expect(context.files.size).toBe(0);
	});

	it("extracts from the active editor and safely creates a note", async () => {
		const activeView = {
			file: { basename: "Example", path: "Folder/Example.md" },
			editor: { getValue: () => "Text with ==important== content." },
		};
		const context = createApp(activeView);
		mockState.app = context.app;
		const writeText = vi.fn(async () => {});
		vi.stubGlobal("navigator", { clipboard: { writeText } });
		const plugin = new ProseToolkitPlugin(context.app as never, {} as never);
		await plugin.onload();
		plugin.settings.createNewFile = true;
		const parse = vi.spyOn(TextWorkerClient.prototype, "extract").mockImplementation(async (text, bold) => extractHighlights(text, bold));
		await plugin.extractActiveNote(); parse.mockRestore();

		expect(writeText).toHaveBeenCalledWith("important\n");
		expect(context.files.get("Highlights for Example.md")).toContain(
			"## Source\n\n- [Example](<Folder/Example.md>)",
		);
		expect(mockState.notices.at(-1)).toContain("Found 1 highlight");
		vi.unstubAllGlobals();
	});
});

describe("settings recovery host controls", () => {
	it("requires confirmation, preserves the original, and enables repaired settings", async () => {
		mockState.loadedData = { schemaVersion: 99, createNewFile: true };
		mockState.savedData.length = 0; mockState.settingTabs.length = 0;
		const context = createApp(); mockState.app = context.app;
		const plugin = new ProseToolkitPlugin(context.app as never, {} as never); await plugin.onload();
		const tab = mockState.settingTabs[0] as { getSettingDefinitions(): Array<{ heading?: string; items?: Array<{ action?: () => Promise<void> }> }> };
		const action = tab.getSettingDefinitions().find((group) => group.heading === "Saved settings recovery")!.items![0].action!;
		await action();
		let dialog = document.querySelector('[aria-label="Restore default settings?"]')!;
		const cancel = Array.from(dialog.querySelectorAll("button")).find((button) => button.textContent === "Cancel")!;
		cancel.click(); expect(mockState.savedData).toHaveLength(0); expect(plugin.settingsRecoveryReason).not.toBeNull();
		await action(); dialog = document.querySelector('[aria-label="Restore default settings?"]')!;
		Array.from(dialog.querySelectorAll("button")).find((button) => button.textContent === "Restore defaults")!.click();
		await vi.waitFor(() => expect(plugin.settingsRecoveryReason).toBeNull());
		const backup = [...context.settingsFiles.entries()].find(([path]) => path.includes("recovery"))![1];
		const decoded = JSON.parse(backup) as { original: string };
		expect(JSON.parse(decoded.original)).toEqual({ schemaVersion: 99, createNewFile: true });
		expect(plugin.settings.createNewFile).toBe(false);
	});
	it("uses an actual manifest folder that differs from the released id", async () => {
		mockState.loadedData = null;
		const context = createApp(); mockState.app = context.app;
		const plugin = new ProseToolkitPlugin(context.app as never, {} as never);
		(plugin.manifest as { dir?: string }).dir = "custom-config/plugins/development-folder";
		await plugin.onload(); plugin.settings.createNewFile = true; await plugin.saveSettings();
		expect(context.settingsFiles.has("custom-config/plugins/development-folder/data.json")).toBe(true);
		expect(context.settingsFiles.has("fixture-config/plugins/prose-toolkit/data.json")).toBe(false);
	});
});

describe("settings ownership and queued drafts", () => {
	it("commits a newer queued draft without replacing it with an earlier completion", async () => {
		mockState.loadedData = null;
		const context = createApp(); mockState.app = context.app;
		const plugin = new ProseToolkitPlugin(context.app as never, {} as never); await plugin.onload();
		const adapter = context.app.vault.adapter, original = { ...adapter };
		let release: (() => void) | undefined;
		let delayed = false;
		adapter.write = async (path, data) => {
			if (!delayed) { delayed = true; await new Promise<void>((resolve) => { release = resolve; }); }
			await original.write(path, data);
		};
		plugin.settings.headlineText = "first";
		const first = plugin.saveSettings();
		await vi.waitFor(() => expect(release).toBeTypeOf("function"));
		plugin.settings.headlineText = "second";
		const second = plugin.saveSettings(); release!();
		await first;
		expect(plugin.settings.headlineText).toBe("second");
		await second;
		const data = JSON.parse(context.settingsFiles.get("fixture-config/plugins/prose-toolkit/data.json")!) as { headlineText: string };
		expect(data.headlineText).toBe("second"); expect(plugin.settings.headlineText).toBe("second");
	});
	it("keeps malformed raw settings visible for recovery when host loadData returns null", async () => {
		const context = createApp(); mockState.app = context.app;
		const path = "fixture-config/plugins/prose-toolkit/data.json", raw = "{malformed fixture";
		context.settingsFiles.set(path, raw);
		const plugin = new ProseToolkitPlugin(context.app as never, {} as never);
		const hostLoad = vi.spyOn(plugin, "loadData").mockResolvedValue(null);
		await plugin.onload();
		expect(hostLoad).not.toHaveBeenCalled(); expect(plugin.settingsRecoveryReason).toMatch(/could not be read/);
		expect(context.settingsFiles.get(path)).toBe(raw);
		await expect(plugin.saveSettings()).rejects.toThrow(/could not be read/);
		expect(context.settingsFiles.get(path)).toBe(raw); plugin.onunload();
	});

	it("does not register controls if the plugin closes while loading settings", async () => {
		mockState.commands.length = 0; mockState.settingTabs.length = 0;
		const context = createApp(); mockState.app = context.app;
		const plugin = new ProseToolkitPlugin(context.app as never, {} as never);
		let release!: (value: boolean) => void;
		vi.spyOn(context.app.vault.adapter, "exists").mockImplementation(() => new Promise((resolve) => { release = resolve; }));
		const loading = plugin.onload(); plugin.onunload(); release(false); await loading;
		expect(mockState.commands).toHaveLength(0); expect(mockState.settingTabs).toHaveLength(0);
	});
});

describe("asynchronous sentence boundaries", () => {
	it("requests only the current range rather than rescanning the same first line", async () => {
		mockState.loadedData = null;
		const editor = new MockEditor("First. " + "Later. ".repeat(10000), { line: 0, ch: 2 });
		const view = { file: { path: "Synthetic.md" }, editor: editor.asEditor() }, context = createApp(view); mockState.app = context.app;
		const plugin = new ProseToolkitPlugin(context.app as never, {} as never); await plugin.onload();
		const worker = vi.spyOn(TextWorkerClient.prototype, "sentences").mockResolvedValue([[{ from: 0, to: 6 }]]);
		await plugin.runSentenceAction(editor.asEditor(), selectSentence);
		expect(worker.mock.calls[0][1]).toHaveLength(1);
		expect(worker.mock.calls[0][1][0].until).toBe(2);
		expect(editor.getSelection()).toBe("First."); worker.mockRestore(); plugin.onunload();
	});
	it("does not apply a resolved range after the source note changes", async () => {
		mockState.loadedData = null;
		const editor = new MockEditor("First. " + "Later. ".repeat(1000), { line: 0, ch: 2 });
		const view = { file: { path: "Synthetic.md" }, editor: editor.asEditor() }, context = createApp(view); mockState.app = context.app;
		const plugin = new ProseToolkitPlugin(context.app as never, {} as never); await plugin.onload();
		let resolve!: (ranges: Array<Array<{ from: number; to: number }>>) => void;
		const worker = vi.spyOn(TextWorkerClient.prototype, "sentences").mockImplementation(() => new Promise((done) => { resolve = done; }));
		const pending = plugin.runSentenceAction(editor.asEditor(), selectSentence); view.file.path = "Other.md";
		resolve([[{ from: 0, to: 6 }]]); await pending;
		expect(editor.getSelection()).toBe(""); worker.mockRestore(); plugin.onunload();
	});
});

describe("queued extraction cancellation", () => {
	it("cancels a queued command before its worker or clipboard starts", async () => {
		mockState.loadedData = null;
		const view = { file: { basename: "Synthetic", path: "Synthetic.md" }, editor: { getValue: () => "==Point==" } }, context = createApp(view); mockState.app = context.app;
		const plugin = new ProseToolkitPlugin(context.app as never, {} as never); await plugin.onload();
		const parse = vi.spyOn(TextWorkerClient.prototype, "extract");
		const pending = plugin.extractActiveNote(); plugin.cancelTextOperation(); await pending;
		expect(parse).not.toHaveBeenCalled(); expect(context.files.size).toBe(0);
		parse.mockRestore(); plugin.onunload();
	});
});
