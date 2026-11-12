import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import globals from "globals";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
	{ ignores: ["main.js", "coverage/", "node_modules/", "eslint.config.mts"] },
	...obsidianmd.configs.recommended,
	{
		files: ["**/*.ts"],
		languageOptions: {
			parser: tsparser,
			parserOptions: {
				project: "./tsconfig.json",
				tsconfigRootDir: import.meta.dirname,
			},
			globals: { ...globals.browser, ...globals.node },
		},
		rules: {
			"@typescript-eslint/no-explicit-any": "error",
			"@typescript-eslint/no-non-null-assertion": "off",
			"obsidianmd/commands/no-default-hotkeys": "off",
			"obsidianmd/ui/sentence-case": "warn",
		},
	},
	{
		files: ["**/*.mjs"],
		languageOptions: {
			globals: { ...globals.node },
		},
		rules: {
			"obsidianmd/no-nodejs-modules": "off",
			"obsidianmd/rule-custom-message": "off",
		},
	},
	{
		files: ["tests/**/*.ts", "vitest.config.ts"],
		rules: {
			"obsidianmd/prefer-create-el": "off",
			"obsidianmd/no-nodejs-modules": "off",
		},
	},
	{
		files: ["tests/**/*.mjs"],
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: { "obsidianmd/hardcoded-config-path": "off", "obsidianmd/prefer-window-timers": "off" },
	},

	{
		files: ["tests/text-worker.test.ts"],
		rules: { "obsidianmd/prefer-window-timers": "off" },
	},
]);
