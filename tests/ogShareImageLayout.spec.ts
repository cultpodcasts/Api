import { describe, expect, it } from "vitest";
import { parseWideLayout } from "../src/ogWideLayout";

describe("parseWideLayout", () => {
	it("defaults unknown values to columns", () => {
		expect(parseWideLayout(undefined)).toBe("columns");
		expect(parseWideLayout("")).toBe("columns");
		expect(parseWideLayout("nope")).toBe("columns");
	});

	it("accepts the preview wide-layout ids", () => {
		expect(parseWideLayout("footer")).toBe("footer");
		expect(parseWideLayout("columns")).toBe("columns");
		expect(parseWideLayout("stack")).toBe("stack");
		expect(parseWideLayout("inline")).toBe("inline");
	});
});
