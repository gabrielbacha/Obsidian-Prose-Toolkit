import { buildSync } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

mkdirSync(".test-cache", { recursive: true });
writeFileSync(".test-cache/text-worker.js", buildSync({ entryPoints: ["src/text-worker.ts"], bundle: true, platform: "browser", format: "iife", target: "es2021", write: false }).outputFiles[0].text);

export default defineConfig({
	resolve: {
		alias: {
			"prose-toolkit:worker": new URL("./tests/text-worker-source.ts", import.meta.url).pathname,
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
