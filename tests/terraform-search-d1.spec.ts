import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-ignore - plain .mjs CLI helpers
import { findForbiddenChanges, summarisePlan } from "../infra/terraform/scripts/plan-guard.mjs";
// @ts-ignore - plain .mjs CLI helpers
import { applyIds, idsFromOutputs } from "../infra/terraform/scripts/sync-wrangler-ids.mjs";

/** SP-1.10 (cultpodcasts/Api#270): Terraform for the search D1 databases. */

const tfDir = resolve(process.cwd(), "infra/terraform/search-d1");
const tf = readdirSync(tfDir)
	.filter((f) => f.endsWith(".tf"))
	.map((f) => readFileSync(resolve(tfDir, f), "utf8"))
	.join("\n");
const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/terraform-search-d1.yml"), "utf8");

function plan(...changes: { type?: string; address?: string; actions: string[] }[]) {
	return {
		format_version: "1.2",
		resource_changes: changes.map((c, i) => ({
			address: c.address ?? `cloudflare_d1_database.db${i}`,
			type: c.type ?? "cloudflare_d1_database",
			change: { actions: c.actions }
		}))
	};
}

describe("plan guard", () => {
	it("allows creating the databases", () => {
		expect(findForbiddenChanges(plan({ actions: ["create"] }, { actions: ["create"] }))).toEqual([]);
	});

	it("allows in-place updates and no-ops", () => {
		expect(findForbiddenChanges(plan({ actions: ["update"] }, { actions: ["no-op"] }))).toEqual([]);
	});

	it("fails on destroying a D1 database (e.g. its resource block was removed)", () => {
		const forbidden = findForbiddenChanges(
			plan({ address: "cloudflare_d1_database.search", actions: ["delete"] })
		);
		expect(forbidden).toEqual([
			expect.objectContaining({ address: "cloudflare_d1_database.search", reason: "would be DESTROYED" })
		]);
	});

	it.each([
		[["delete", "create"]],
		[["create", "delete"]]
	])("fails on replacing a D1 database (%j)", (actions) => {
		const forbidden = findForbiddenChanges(plan({ address: "cloudflare_d1_database.search_preview", actions }));
		expect(forbidden).toHaveLength(1);
		expect(forbidden[0].reason).toMatch(/REPLACED/);
	});

	it("ignores deletes of unprotected resource types", () => {
		expect(findForbiddenChanges(plan({ type: "cloudflare_workers_kv", actions: ["delete"] }))).toEqual([]);
	});

	it("rejects input that is not a plan", () => {
		expect(() => findForbiddenChanges({})).toThrow(/format_version/);
	});

	it("treats a plan with no resource_changes as safe", () => {
		expect(findForbiddenChanges({ format_version: "1.2" })).toEqual([]);
		expect(summarisePlan({ format_version: "1.2" })).toBe("(no resource changes)");
	});
});

describe("Terraform config", () => {
	it("declares both search databases in WEUR", () => {
		expect(tf).toMatch(/resource "cloudflare_d1_database" "search"\s*\{[^}]*name\s*=\s*"cultpodcasts-search"/);
		expect(tf).toMatch(
			/resource "cloudflare_d1_database" "search_preview"\s*\{[^}]*name\s*=\s*"cultpodcasts-search-preview"/
		);
		expect(tf).toMatch(/default\s*=\s*"weur"/);
	});

	it("protects every D1 database with prevent_destroy", () => {
		const resources = tf.match(/resource "cloudflare_d1_database"/g) ?? [];
		const protectedCount = tf.match(/prevent_destroy\s*=\s*true/g) ?? [];
		expect(resources.length).toBe(2);
		expect(protectedCount.length).toBe(resources.length);
	});

	it("keeps state in the R2 backend with locking", () => {
		expect(tf).toMatch(/backend "s3"/);
		expect(tf).toContain("r2.cloudflarestorage.com");
		expect(tf).toMatch(/use_lockfile\s*=\s*true/);
	});

	it("contains no credentials", () => {
		expect(tf).not.toMatch(/api_token\s*=|access_key\s*=|secret_key\s*=/);
	});
});

describe("Terraform workflow", () => {
	it("never runs destroy", () => {
		expect(workflow).not.toMatch(/terraform\s+(-chdir=\S+\s+)?destroy/);
		expect(workflow).not.toMatch(/-destroy\b/);
	});

	it("applies only behind the approval environment, from a guarded saved plan", () => {
		expect(workflow).toMatch(/environment:\s*cloudflare-production/);
		expect(workflow).toMatch(/apply[^\n]*-input=false[^\n]*tfplan/);
		expect(workflow.match(/plan-guard\.mjs/g)?.length).toBeGreaterThanOrEqual(2);
	});

	it("applies migrations to preview before production", () => {
		const preview = workflow.indexOf("cultpodcasts-search-preview --remote");
		const production = workflow.indexOf("cultpodcasts-search --remote");
		expect(preview).toBeGreaterThan(-1);
		expect(production).toBeGreaterThan(preview);
	});

	it("serialises runs", () => {
		expect(workflow).toMatch(/concurrency:\s*\n\s*group:\s*terraform-search-d1/);
	});
});

describe("sync-wrangler-ids", () => {
	const outputs = {
		search_database_name: { value: "cultpodcasts-search" },
		search_database_id: { value: "11111111-2222-3333-4444-555555555555" },
		search_preview_database_name: { value: "cultpodcasts-search-preview" },
		search_preview_database_id: { value: "66666666-7777-8888-9999-000000000000" }
	};
	const config = `{
	"d1_databases": [
		{
			"binding": "SEARCH_DB",
			"database_name": "cultpodcasts-search",
			// PLACEHOLDER until Terraform provisions the database
			"database_id": "PLACEHOLDER-cultpodcasts-search-database-id",
			"migrations_dir": "workers/search/migrations"
		}
	],
	"env": { "preview": { "d1_databases": [
		{
			"binding": "SEARCH_DB",
			"database_name": "cultpodcasts-search-preview",
			"database_id": "PLACEHOLDER-cultpodcasts-search-preview-database-id"
		}
	] }, "local": { "d1_databases": [
		{ "binding": "SEARCH_DB", "database_name": "local-only", "database_id": "local-cultpodcasts-search" }
	] } }
}`;

	it("replaces both placeholders and keeps comments and other bindings", () => {
		const { text, found } = applyIds(config, idsFromOutputs(outputs));
		expect(found.sort()).toEqual(["cultpodcasts-search", "cultpodcasts-search-preview"]);
		expect(text).toContain('"database_id": "11111111-2222-3333-4444-555555555555"');
		expect(text).toContain('"database_id": "66666666-7777-8888-9999-000000000000"');
		expect(text).toContain("// PLACEHOLDER until Terraform provisions the database");
		expect(text).toContain('"database_id": "local-cultpodcasts-search"');
		expect(text).not.toContain("PLACEHOLDER-");
	});

	it("is idempotent", () => {
		const ids = idsFromOutputs(outputs);
		const once = applyIds(config, ids).text;
		expect(applyIds(once, ids).text).toBe(once);
	});

	it("rejects missing or malformed outputs", () => {
		expect(() => idsFromOutputs({ ...outputs, search_database_id: { value: "nope" } })).toThrow(/malformed/);
		expect(() => idsFromOutputs({})).toThrow();
	});
});
