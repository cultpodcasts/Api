import { describe, expect, it, vi } from "vitest";
import { AddResponseHeaders } from "../src/AddResponseHeaders";

describe("AddResponseHeaders", () => {
	it("sets uppercase Allow-Methods (toUpperCase invoked)", () => {
		const headers: Record<string, string> = {};
		const c = {
			req: { method: "GET", header: () => null },
			env: { stagingHostSuffix: "" },
			header: (name: string, value: string) => {
				headers[name] = value;
			}
		};

		AddResponseHeaders(c as never, { methods: ["get", "post", "options"] });

		expect(headers["Access-Control-Allow-Methods"]).toBe("GET,POST,OPTIONS");
	});
});
