import { defineConfig } from "vitest/config";

/** SP-1.8 ranking harness: network (public Azure search) and slow, so never part of `npm test`. */
export default defineConfig({
	test: {
		include: ["workers/search/harness/**/*.harness.ts"],
		environment: "node",
		setupFiles: ["tests/setup-cloudflare-stub.ts"]
	}
});
