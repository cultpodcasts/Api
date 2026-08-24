import { describe, expect, it } from "vitest";
import { parseWideLayout } from "../src/ogWideLayout";

describe("parseWideLayout", () => {
	it("defaults unknown values to footer", () => {
		expect(parseWideLayout(undefined)).toBe("footer");
		expect(parseWideLayout("")).toBe("footer");
		expect(parseWideLayout("nope")).toBe("footer");
	});

	it("accepts the preview wide-layout ids", () => {
		expect(parseWideLayout("footer")).toBe("footer");
		expect(parseWideLayout("columns")).toBe("columns");
		expect(parseWideLayout("stack")).toBe("stack");
		expect(parseWideLayout("inline")).toBe("inline");
	});
});
