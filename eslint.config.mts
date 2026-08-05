import eslint from "@eslint/js";
import globals from "globals";
import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

export default tseslint.config(
	{ ignores: ["main.js", "coverage/", "node_modules/"] },
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ["**/*.ts"],
		plugins: { obsidianmd },
		languageOptions: {
			globals: { ...globals.browser, ...globals.node },
		},
		rules: {
			"@typescript-eslint/no-explicit-any": "error",
			"@typescript-eslint/no-non-null-assertion": "off",
			"obsidianmd/ui/sentence-case": "warn"
		}
	},
	{
		files: ["**/*.mjs"],
		languageOptions: {
			globals: { ...globals.node },
		},
	}
);
