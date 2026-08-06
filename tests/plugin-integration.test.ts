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

function createApp(activeView: unknown = null) {
	const files = new Map<string, string>();
	return {
		files,
		app: {
			workspace: {
				getActiveViewOfType: () => activeView,
				openLinkText: vi.fn(async () => {}),
			},
			vault: {
				getAbstractFileByPath: (path: string) =>
					files.has(path) ? { path } : null,
				create: vi.fn(async (path: string, contents: string) => {
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
		expect(mockState.savedData).toHaveLength(1);
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
			"Sentence navigation",
			"Highlight extraction",
			"Exploded notes",
		]);
		const explodeControl = definitions[2].items?.[0].control;
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
			file: { basename: "Example" },
			editor: { getValue: () => "Text with ==important== content." },
		};
		const context = createApp(activeView);
		mockState.app = context.app;
		const writeText = vi.fn(async () => {});
		vi.stubGlobal("navigator", { clipboard: { writeText } });
		const plugin = new ProseToolkitPlugin(context.app as never, {} as never);
		await plugin.onload();
		plugin.settings.createNewFile = true;
		await plugin.extractActiveNote();

		expect(writeText).toHaveBeenCalledWith("important\n");
		expect(context.files.get("Highlights for Example.md")).toContain(
			"## Source\n\n- [[Example]]",
		);
		expect(mockState.notices.at(-1)).toContain("Found 1 highlight");
		vi.unstubAllGlobals();
	});
});
