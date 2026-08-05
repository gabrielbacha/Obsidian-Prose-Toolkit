import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			obsidian: new URL("./tests/empty-obsidian.ts", import.meta.url).pathname,
		},
	},
	test: {
		environment: "jsdom",
		include: ["tests/**/*.test.ts"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json-summary"],
			include: ["src/**/*.ts"],
			exclude: ["src/main.ts", "src/settings-tab.ts", "src/commands.ts"],
		},
	},
});
