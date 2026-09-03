import { vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
	DurableObject: class DurableObject {
		constructor(_ctx: unknown, _env: unknown) {}
	}
}));
