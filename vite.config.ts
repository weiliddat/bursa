/// <reference types="vitest" />
/// <reference types="vitest/config" />

import { defineConfig } from "vite";

export default defineConfig({
	test: {
		globals: false,
		// if you have few tests, try commenting this
		// out to improve performance:
		isolate: false,
	},
	build: {
		target: "esnext",
	},
});
