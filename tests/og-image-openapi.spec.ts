import { describe, expect, it } from "vitest";
import { getOgShareImageOpenApiSchema } from "../src/ogShareImageOpenApi";
import { ogImageQuerySchema } from "../src/openapiSchemas";

describe("GET /og-image OpenAPI", () => {
	it("documents the query contract", () => {
		expect(getOgShareImageOpenApiSchema.request?.query).toBe(ogImageQuerySchema);
		expect(ogImageQuerySchema.shape.u).toBeDefined();
		expect(ogImageQuerySchema.shape.a).toBeDefined();
		expect(ogImageQuerySchema.shape.t).toBeDefined();
	});

	it("documents PNG success and redirect fallback", () => {
		expect(getOgShareImageOpenApiSchema.responses?.[200]?.content?.["image/png"]).toBeDefined();
		expect(getOgShareImageOpenApiSchema.responses?.[307]).toBeDefined();
		expect(getOgShareImageOpenApiSchema.responses?.[400]).toBeDefined();
	});
});
