import { defineConfig } from "vitest/config";

/**
 * Behavior-contract suite for pure helpers + source contracts.
 * Full Worker SELF.fetch journeys can move to @cloudflare/vitest-pool-workers
 * once CI can install that package reliably.
 */
export default defineConfig({
	test: {
		include: ["tests/**/*.spec.ts"],
		environment: "node",
		setupFiles: ["tests/setup-cloudflare-stub.ts"]
	},
	assetsInclude: ["**/*.woff"]
});
