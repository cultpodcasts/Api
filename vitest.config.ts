import { defineConfig } from "vitest/config";

/**
 * Behavior-contract suite for pure helpers + source contracts.
 * Full Worker SELF.fetch journeys can move to @cloudflare/vitest-pool-workers
 * once CI can install that package reliably (same journeys covered here via
 * cors/auth/discovery-curation contracts).
 */
export default defineConfig({
	test: {
		include: ["tests/**/*.spec.ts"],
		environment: "node"
	}
});
