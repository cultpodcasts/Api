import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-ignore - plain .mjs CLI helpers
import { findForbiddenChanges, summarisePlan } from "../infra/terraform/scripts/plan-guard.mjs";
// @ts-ignore - plain .mjs CLI helpers
import { applyIds, buildMigrationsConfig, idsFromOutputs } from "../infra/terraform/scripts/sync-wrangler-ids.mjs";
// @ts-ignore - plain .mjs CLI helpers
import { findPlanCommentId, PLAN_MARKER } from "../infra/terraform/scripts/sticky-plan-comment.mjs";
// @ts-ignore - plain .mjs CLI helpers
import { evaluateWorkspace, readCloudBlock } from "../infra/terraform/scripts/hcp-workspace-check.mjs";

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
	it("allows creating the databases only with allowCreate (the first apply)", () => {
		expect(
			findForbiddenChanges(plan({ actions: ["create"] }, { actions: ["create"] }), { allowCreate: true })
		).toEqual([]);
	});

	it("fails on creating a D1 database without allowCreate (it vanished from state: drift recreation)", () => {
		const forbidden = findForbiddenChanges(plan({ address: "cloudflare_d1_database.search", actions: ["create"] }));
		expect(forbidden).toEqual([
			expect.objectContaining({ address: "cloudflare_d1_database.search", reason: expect.stringMatching(/CREATED/) })
		]);
	});

	it("allowCreate never allows a replace", () => {
		expect(
			findForbiddenChanges(plan({ actions: ["delete", "create"] }), { allowCreate: true })
		).toHaveLength(1);
	});

	it("CLI exits 1 for an unexpected create and 0 with --allow-create", () => {
		const dir = mkdtempSync(join(tmpdir(), "plan-guard-"));
		const file = join(dir, "plan.json");
		writeFileSync(file, JSON.stringify(plan({ actions: ["create"] })));
		const script = resolve(process.cwd(), "infra/terraform/scripts/plan-guard.mjs");
		expect(spawnSync(process.execPath, [script, file]).status).toBe(1);
		expect(spawnSync(process.execPath, [script, file, "--allow-create"]).status).toBe(0);
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
		expect(findForbiddenChanges(plan({ type: "cloudflare_workers_kv", actions: ["create"] }))).toEqual([]);
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

	it("keeps state in HCP Terraform in the cultpodcasts organisation (no S3/R2 backend)", () => {
		expect(tf).toMatch(/cloud\s*\{\s*organization\s*=\s*"cultpodcasts"/);
		expect(tf).not.toMatch(/organization\s*=\s*"freedomtimes"/);
		expect(tf).toMatch(/name\s*=\s*"cultpodcasts-api-search-d1"/);
		expect(tf).not.toMatch(/backend "s3"/);
		expect(tf).not.toContain("r2.cloudflarestorage.com");
	});

	it("takes the Cloudflare token from a sensitive variable", () => {
		expect(tf).toMatch(/api_token\s*=\s*var\.cloudflare_api_token/);
		expect(tf).toMatch(/variable "cloudflare_api_token"\s*\{[^}]*sensitive\s*=\s*true/);
	});

	it("contains no credentials", () => {
		expect(tf).not.toMatch(/api_token\s*=\s*"|access_key\s*=|secret_key\s*=|token\s*=\s*"/);
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

	/** Text of one job (from its key to the next top-level job key). */
	function job(name: string): string {
		const start = workflow.indexOf(`\n  ${name}:\n`);
		expect(start, `job ${name}`).toBeGreaterThan(-1);
		const rest = workflow.slice(start + 1);
		const next = rest.slice(1).search(/\n  [a-z-]+:\n/);
		return next === -1 ? rest : rest.slice(0, next + 1);
	}

	it("authenticates to HCP like freedomtimes, with no R2/AWS secrets", () => {
		expect(workflow).toContain("TF_TOKEN_app_terraform_io: ${{ secrets.TF_TOKEN_APP_TERRAFORM_IO }}");
		expect(workflow).not.toMatch(/AWS_|R2_/);
	});

	it("plans with the D1 Read token and only the approved apply job gets the D1 Edit token", () => {
		expect(job("plan")).toContain("TF_VAR_cloudflare_api_token: ${{ secrets.TF_PLAN_CLOUDFLARE_API_TOKEN }}");
		expect(job("plan")).not.toContain("TF_APPLY_CLOUDFLARE_API_TOKEN");
		const apply = job("apply");
		expect(apply).toMatch(/environment:\s*cloudflare-production/);
		expect(apply).toContain("TF_VAR_cloudflare_api_token: ${{ secrets.TF_APPLY_CLOUDFLARE_API_TOKEN }}");
		expect(apply).toContain("CLOUDFLARE_API_TOKEN: ${{ secrets.TF_APPLY_CLOUDFLARE_API_TOKEN }}");
		const applyUses = workflow.match(/secrets\.TF_APPLY_CLOUDFLARE_API_TOKEN/g)?.length ?? 0;
		const applyInApplyJob = apply.match(/secrets\.TF_APPLY_CLOUDFLARE_API_TOKEN/g)?.length ?? 0;
		// The only other use is readiness checking it is NOT visible outside the environment.
		expect(applyUses - applyInApplyJob).toBe(1);
		expect(job("readiness")).toMatch(/APPLY_TOKEN_OUTSIDE_ENVIRONMENT[\s\S]*exit 1/);
		expect(workflow).not.toMatch(/secrets\.TF_VAR_CLOUDFLARE_API_TOKEN|secrets\.CLOUDFLARE_API_TOKEN\b/);
	});

	it("has no workflow-level concurrency; plans cancel per PR and applies queue without cancelling", () => {
		expect(workflow).not.toMatch(/^concurrency:/m);
		expect(job("plan")).toContain(
			"group: terraform-search-d1-plan-${{ github.event_name }}-${{ github.event.pull_request.number || github.ref }}"
		);
		// Only PR plans cancel; main pushes and the first-apply dispatch never do.
		expect(job("plan")).toContain("cancel-in-progress: ${{ github.event_name == 'pull_request' }}");
		expect(job("plan")).not.toMatch(/cancel-in-progress:\s*true/);
		expect(job("apply")).toMatch(
			/concurrency:\s*\n\s*group:\s*terraform-search-d1-apply\s*\n\s*cancel-in-progress:\s*false/
		);
		expect(workflow.match(/-lock-timeout=5m/g)?.length).toBeGreaterThanOrEqual(4);
	});

	it("passes --allow-create to the guard only from the manual allow_d1_create input", () => {
		expect(workflow).toMatch(/allow_d1_create:\s*\n[\s\S]*?type:\s*boolean\s*\n\s*default:\s*false/);
		expect(workflow).toContain(
			"PLAN_GUARD_FLAGS: ${{ (github.event_name == 'workflow_dispatch' && inputs.allow_d1_create) && '--allow-create' || '' }}"
		);
		expect(workflow).not.toMatch(/plan-guard\.mjs[^\n]*--allow-create/);
	});

	it("checks the HCP workspace is Local before every init", () => {
		for (const name of ["plan", "apply"]) {
			const j = job(name);
			expect(j.indexOf("hcp-workspace-check.mjs")).toBeGreaterThan(-1);
			expect(j.indexOf("hcp-workspace-check.mjs")).toBeLessThan(j.indexOf("init -lock-timeout"));
		}
	});

	it("keeps one sticky plan comment per PR by marker, with the head SHA", () => {
		expect(workflow).toContain('sticky-plan-comment.mjs "$PR" "$RUNNER_TEMP/plan.md"');
		expect(workflow).not.toContain("--edit-last");
		expect(workflow).toContain(PLAN_MARKER);
		expect(workflow).toContain("github.event.pull_request.head.sha");
	});

	it("builds the migrations config from Terraform outputs, not a hand-written copy", () => {
		expect(workflow).toContain("sync-wrangler-ids.mjs \"$RUNNER_TEMP/tf-outputs.json\" --migrations-config");
		expect(workflow).not.toContain("bae3f835f19899c6eee1ec48f2d658cf");
	});

	it("fails on real wrangler ids that differ from Terraform, warns only on placeholders", () => {
		expect(job("apply")).toMatch(/PLACEHOLDER-[\s\S]*::warning[\s\S]*::error title=wrangler\.search\.jsonc[\s\S]*exit 1/);
	});

	it("pins every third-party action to a commit SHA", () => {
		const uses = [...workflow.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
		expect(uses.length).toBeGreaterThan(0);
		for (const u of uses) expect(u, u).toMatch(/@[0-9a-f]{40}$/);
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

	it("builds the CI migrations config from outputs only, preview first", () => {
		const config = buildMigrationsConfig({ ...outputs, account_id: { value: "0123456789abcdef0123456789abcdef" } });
		expect(config.account_id).toBe("0123456789abcdef0123456789abcdef");
		expect(config.d1_databases).toEqual([
			{
				binding: "SEARCH_PREVIEW_DB",
				database_name: "cultpodcasts-search-preview",
				database_id: "66666666-7777-8888-9999-000000000000",
				migrations_dir: "workers/search/migrations"
			},
			{
				binding: "SEARCH_DB",
				database_name: "cultpodcasts-search",
				database_id: "11111111-2222-3333-4444-555555555555",
				migrations_dir: "workers/search/migrations"
			}
		]);
	});

	it("refuses a migrations config without a valid account id output", () => {
		expect(() => buildMigrationsConfig(outputs)).toThrow(/account_id/);
		expect(() => buildMigrationsConfig({ ...outputs, account_id: { value: "x" } })).toThrow(/account_id/);
	});

	it("Terraform outputs the account id for the migrations config", () => {
		expect(tf).toMatch(/output "account_id"\s*\{\s*value\s*=\s*var\.cloudflare_account_id/);
	});
});

describe("sticky plan comment", () => {
	const bot = { login: "github-actions[bot]" };
	const plan = (id: number, sha: string) => ({ id, user: bot, body: `${PLAN_MARKER}\n### Terraform plan for \`${sha}\`` });

	it("edits the bot comment with the plan marker, not an unrelated later bot comment", () => {
		const comments = [
			plan(10, "aaa"),
			{ id: 11, user: bot, body: "Coverage report: 91%" },
			{ id: 12, user: { login: "jon" }, body: "LGTM" }
		];
		expect(findPlanCommentId(comments)).toBe(10);
	});

	it("ignores a human comment that quotes the marker", () => {
		expect(findPlanCommentId([{ id: 20, user: { login: "jon" }, body: `> ${PLAN_MARKER}` }])).toBeUndefined();
	});

	it("returns nothing when there is no plan comment yet (create one)", () => {
		expect(findPlanCommentId([{ id: 30, user: bot, body: "other bot output" }])).toBeUndefined();
		expect(findPlanCommentId([])).toBeUndefined();
	});

	it("picks the newest plan comment if an older run left a duplicate", () => {
		expect(findPlanCommentId([plan(40, "old"), plan(41, "new")])).toBe(41);
	});
});

describe("HCP workspace check", () => {
	it("reads the organisation and workspace from the single cloud block", () => {
		const versions = readFileSync(resolve(tfDir, "versions.tf"), "utf8");
		expect(readCloudBlock(versions)).toEqual({ organization: "cultpodcasts", workspace: "cultpodcasts-api-search-d1" });
		expect(versions.match(/organization\s*=/g)).toHaveLength(1);
	});

	it("follows a changed organisation without other edits", () => {
		const text = `terraform {\n  cloud {\n    organization = "some-other-org"\n\n    workspaces {\n      name = "cultpodcasts-api-search-d1"\n    }\n  }\n}\n`;
		expect(readCloudBlock(text).organization).toBe("some-other-org");
	});

	it("rejects a file without a cloud block", () => {
		expect(() => readCloudBlock("terraform {}\n")).toThrow(/cloud/);
	});

	const target = { organization: "cultpodcasts", workspace: "cultpodcasts-api-search-d1" };
	const ws = (mode: string) => ({ data: { attributes: { "execution-mode": mode } } });

	it("passes only for an existing Local workspace", () => {
		expect(evaluateWorkspace(target, 200, ws("local")).ok).toBe(true);
	});

	it.each([
		[404, undefined, /not found/],
		[401, undefined, /token rejected/],
		[200, ws("remote"), /must be "local"/],
		[200, ws("agent"), /must be "local"/],
		[500, undefined, /returned 500/]
	])("fails clearly for status %s", (status, body, message) => {
		const result = evaluateWorkspace(target, status, body);
		expect(result.ok).toBe(false);
		expect(result.message).toMatch(message);
	});
});
