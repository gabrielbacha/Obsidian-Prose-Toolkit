import type { Editor, Plugin } from "obsidian";
import {
	BOLD_HIGHLIGHT_WRAPPER,
	BOLD_WRAPPER,
	HIGHLIGHT_WRAPPER,
	toggleLineFormat,
	toggleSentenceFormat,
} from "./formatting";
import {
	deleteToBoundary,
	moveToStartOfCurrentSentence,
	moveToStartOfNextSentence,
	selectCurrentLine,
	selectSentence,
	selectToBoundary,
} from "./sentence/actions";

export interface CommandHost extends Plugin {
	getSentencePattern(): RegExp;
	extractActiveNote(): Promise<void>;
}

type EditorAction = (editor: Editor, pattern: RegExp) => void;

function sentenceAction(host: CommandHost, action: EditorAction) {
	return (editor: Editor) => action(editor, host.getSentencePattern());
}

export function registerCommands(host: CommandHost): void {
	host.addCommand({
		id: "shortcut-extract-highlights",
		name: "Extract highlights",
		icon: "highlighter",
		hotkeys: [{ modifiers: ["Mod", "Alt"], key: "E" }],
		callback: () => host.extractActiveNote(),
	});

	host.addCommand({
		id: "shortcut-highlight-sentence",
		name: "Toggle highlight on current sentence",
		icon: "highlighter",
		hotkeys: [{ modifiers: ["Mod", "Shift"], key: "E" }],
		editorCallback: sentenceAction(host, (editor, pattern) =>
			toggleSentenceFormat(editor, pattern, HIGHLIGHT_WRAPPER),
		),
	});

	host.addCommand({
		id: "shortcut-bold-sentence",
		name: "Toggle bold on current sentence",
		icon: "bold",
		hotkeys: [{ modifiers: ["Mod", "Shift"], key: "B" }],
		editorCallback: sentenceAction(host, (editor, pattern) =>
			toggleSentenceFormat(editor, pattern, BOLD_WRAPPER),
		),
	});

	host.addCommand({
		id: "shortcut-bold-highlight-sentence",
		name: "Toggle bold highlight on current sentence",
		icon: "badge",
		hotkeys: [{ modifiers: ["Mod", "Shift"], key: "R" }],
		editorCallback: sentenceAction(host, (editor, pattern) =>
			toggleSentenceFormat(editor, pattern, BOLD_HIGHLIGHT_WRAPPER),
		),
	});

	host.addCommand({
		id: "shortcut-bold-highlight-paragraph",
		name: "Toggle bold highlight on current line",
		icon: "scan-line",
		hotkeys: [{ modifiers: ["Mod", "Shift"], key: "P" }],
		editorCallback: (editor) =>
			toggleLineFormat(editor, BOLD_HIGHLIGHT_WRAPPER),
	});

	host.addCommand({
		id: "backward-delete-sentence",
		name: "Delete to start of sentence",
		hotkeys: [{ modifiers: ["Mod", "Shift"], key: "Backspace" }],
		editorCallback: sentenceAction(host, (editor, pattern) =>
			deleteToBoundary(editor, "start", pattern),
		),
	});

	host.addCommand({
		id: "forward-delete-sentence",
		name: "Delete to end of sentence",
		hotkeys: [{ modifiers: ["Mod", "Shift"], key: "Delete" }],
		editorCallback: sentenceAction(host, (editor, pattern) =>
			deleteToBoundary(editor, "end", pattern),
		),
	});

	host.addCommand({
		id: "backward-select-sentence",
		name: "Select to start of sentence",
		editorCallback: sentenceAction(host, (editor, pattern) =>
			selectToBoundary(editor, "start", pattern),
		),
	});

	host.addCommand({
		id: "forward-select-sentence",
		name: "Select to end of sentence",
		editorCallback: sentenceAction(host, (editor, pattern) =>
			selectToBoundary(editor, "end", pattern),
		),
	});

	host.addCommand({
		id: "move-start-current-sentence",
		name: "Move to start of current sentence",
		editorCallback: sentenceAction(host, moveToStartOfCurrentSentence),
	});

	host.addCommand({
		id: "move-start-next-sentence",
		name: "Move to start of next sentence",
		editorCallback: sentenceAction(host, moveToStartOfNextSentence),
	});

	host.addCommand({
		id: "select-sentence",
		name: "Select current sentence",
		icon: "scan-line",
		hotkeys: [{ modifiers: ["Mod"], key: "R" }],
		editorCallback: sentenceAction(host, selectSentence),
	});

	host.addCommand({
		id: "select-paragraph",
		name: "Select current line",
		icon: "scan-text",
		hotkeys: [{ modifiers: ["Mod"], key: "G" }],
		editorCallback: selectCurrentLine,
	});
}
