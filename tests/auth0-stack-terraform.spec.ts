import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-ignore - plain .mjs CLI helpers
import { AUTH0_PROTECTED_RESOURCE_TYPES, findCreates, findForbiddenChanges, findForgets, parseArgs, STACKS } from "../infra/terraform/scripts/plan-guard.mjs";
// @ts-ignore - plain .mjs CLI helpers
import { AUTH0_PREVIEW_PLAN_MARKER, PLAN_MARKER, PREVIEW_PLAN_MARKER } from "../infra/terraform/scripts/sticky-plan-comment.mjs";
// @ts-ignore - plain .mjs CLI helpers
import { readCloudBlock } from "../infra/terraform/scripts/hcp-workspace-check.mjs";

/**
 * Auth0 search-index write access in Terraform (cultpodcasts/Api#284): the write:search-index
 * permission, Search Indexer role, writer M2M app and grant, per tenant, and their pipeline.
 * Terraform and workflow files are read as data (HCL / YAML), never production TypeScript.
 */

const root = process.cwd();
function readTf(dir: string): string {
	const abs = resolve(root, dir);
	return readdirSync(abs)
		.filter((f) => f.endsWith(".tf"))
		.map((f) => readFileSync(resolve(abs, f), "utf8"))
		.join("\n");
}
const moduleTf = readTf("infra/terraform/modules/auth0-search-index-writer");
const productionTf = readTf("infra/terraform/auth0/production");
const previewTf = readTf("infra/terraform/auth0/preview");
const allTf = [moduleTf, productionTf, previewTf].join("\n");
const workflow = readFileSync(resolve(root, ".github/workflows/auth0-stack.yml"), "utf8");
const searchWorkflow = readFileSync(resolve(root, ".github/workflows/search-stack.yml"), "utf8");
const guardScript = resolve(root, "infra/terraform/scripts/plan-guard.mjs");

const MODULE_RESOURCES = [
	["auth0_resource_server_scope", "write_search_index"],
	["auth0_role", "search_indexer"],
	["auth0_role_permission", "search_indexer_write_search_index"],
	["auth0_client", "search_index_writer"],
	["auth0_client_credentials", "search_index_writer"],
	["auth0_client_grant", "search_index_writer"]
] as const;

/** The body of one `resource "type" "name" { … }` block (up to the next top-level block). */
function resourceBlock(type: string, name: string): string {
	const start = moduleTf.indexOf(`resource "${type}" "${name}" {`);
	expect(start, `${type}.${name}`).toBeGreaterThan(-1);
	const rest = moduleTf.slice(start);
	const end = rest.indexOf("\n}\n");
	return rest.slice(0, end + 2);
}

function plan(...changes: { type: string; address?: string; actions: string[] }[]) {
	return {
		format_version: "1.2",
		resource_changes: changes.map((c) => ({
			address: c.address ?? `module.search_index_writer.${c.type}.this`,
			type: c.type,
			change: { actions: c.actions }
		}))
	};
}

const auth0 = STACKS.auth0;

describe("plan guard, --stack=auth0", () => {
	it.each(MODULE_RESOURCES.map(([type]) => [type]))("never allows deleting or replacing %s", (type) => {
		expect(AUTH0_PROTECTED_RESOURCE_TYPES).toContain(type);
		for (const actions of [["delete"], ["delete", "create"], ["create", "delete"]]) {
			const forbidden = findForbiddenChanges(plan({ type, actions }), auth0);
			expect(forbidden, actions.join(",")).toHaveLength(1);
			expect(forbidden[0].reason).toMatch(actions.length === 1 ? /DESTROYED/ : /REPLACED/);
		}
	});

	it("also protects the Api itself and bulk scope/permission resources, should anyone add them", () => {
		for (const type of ["auth0_resource_server", "auth0_resource_server_scopes", "auth0_role_permissions"]) {
			expect(findForbiddenChanges(plan({ type, actions: ["delete"] }), auth0), type).toHaveLength(1);
		}
	});

	it("allows creates (first apply, rebuild from scratch), updates and forgets", () => {
		const p = plan(
			...MODULE_RESOURCES.map(([type]) => ({ type, actions: ["create"] })),
			{ type: "auth0_client", actions: ["update"] },
			{ type: "auth0_role", address: "auth0_role.old", actions: ["forget"] }
		);
		expect(findForbiddenChanges(p, auth0)).toEqual([]);
		expect(findForgets(p, auth0.protectedTypes)).toEqual(["auth0_role.old"]);
	});

	it("lists creates of the warned types only", () => {
		const p = plan(
			{ type: "auth0_client", actions: ["create"] },
			{ type: "auth0_role", actions: ["create"] },
			{ type: "auth0_client_grant", actions: ["update"] }
		);
		expect(findCreates(p, auth0.createWarnedTypes)).toEqual(["module.search_index_writer.auth0_client.this"]);
		expect(STACKS.search.createWarnedTypes).toBeUndefined();
	});

	it("the search profile is unchanged: Auth0 types are not its concern, D1 create still guarded", () => {
		expect(findForbiddenChanges(plan({ type: "auth0_client", actions: ["delete"] }))).toEqual([]);
		expect(findForbiddenChanges(plan({ type: "cloudflare_d1_database", actions: ["create"] }))).toHaveLength(1);
	});

	it("parses --stack and rejects an unknown stack, a repeated --stack, and --allow-d1-create outside search", () => {
		expect(parseArgs(["p.json"])).toEqual({ file: "p.json", stack: "search", allowD1Create: false, unknown: [] });
		expect(parseArgs(["p.json", "--stack=auth0"])).toEqual({ file: "p.json", stack: "auth0", allowD1Create: false, unknown: [] });
		expect(parseArgs(["p.json", "--stack=nope"]).unknown).toEqual(["--stack=nope"]);
		expect(parseArgs(["p.json", "--stack=auth0", "--stack=search"]).unknown).toHaveLength(2);
		expect(parseArgs(["p.json", "--stack=auth0", "--allow-d1-create"]).unknown).toEqual(["--allow-d1-create"]);
	});

	it("CLI: exit 1 for an Auth0 client replace, 0 for creates, 2 for bad flags", () => {
		const dir = mkdtempSync(join(tmpdir(), "plan-guard-auth0-"));
		const replace = join(dir, "replace.json");
		const create = join(dir, "create.json");
		writeFileSync(replace, JSON.stringify(plan({ type: "auth0_client", actions: ["delete", "create"] })));
		writeFileSync(create, JSON.stringify(plan(...MODULE_RESOURCES.map(([type]) => ({ type, actions: ["create"] })))));
		const run = (...args: string[]) => spawnSync(process.execPath, [guardScript, ...args], { encoding: "utf8" });
		const refused = run(replace, "--stack=auth0");
		expect(refused.status).toBe(1);
		expect(refused.stderr).toMatch(/REPLACED[\s\S]*Auth0/);
		const created = run(create, "--stack=auth0");
		expect(created.status).toBe(0);
		// A client or grant create is allowed but annotated: on an established tenant it means drift.
		const warnings = created.stdout.split("\n").filter((l) => l.startsWith("::warning") && l.includes("will be CREATED"));
		expect(warnings).toHaveLength(2);
		expect(warnings.join("\n")).toMatch(/auth0_client\.this[\s\S]*auth0_client_grant\.this/);
		// Without --stack the search profile runs, which does not protect Auth0 types.
		expect(run(replace).status).toBe(0);
		expect(run(create, "--stack=bogus").status).toBe(2);
		expect(run(create, "--stack=auth0", "--allow-d1-create").status).toBe(2);
	});
});

describe("Auth0 Terraform: one module, one root per tenant", () => {
	it("the module declares exactly the permission, role, role permission, client, credentials and grant, all prevent_destroy", () => {
		const declared = [...moduleTf.matchAll(/^resource "([a-z0-9_]+)" "([a-z0-9_]+)"/gm)].map((m) => [m[1], m[2]]);
		expect(declared).toEqual(MODULE_RESOURCES.map(([t, n]) => [t, n]));
		for (const [type, name] of MODULE_RESOURCES) {
			expect(resourceBlock(type, name), `${type}.${name}`).toMatch(/lifecycle\s*\{\s*prevent_destroy\s*=\s*true\s*\}/);
		}
	});

	it("references the existing Api by identifier: no auth0_resource_server resource, data source or import", () => {
		expect(allTf).not.toMatch(/(resource|data) "auth0_resource_server"\s/);
		expect(allTf).not.toMatch(/^\s*import\s*\{/m);
		for (const [type, name] of [
			["auth0_resource_server_scope", "write_search_index"],
			["auth0_role_permission", "search_indexer_write_search_index"]
		]) {
			expect(resourceBlock(type, name)).toMatch(/resource_server_identifier\s*=\s*var\.api_identifier/);
		}
		expect(resourceBlock("auth0_client_grant", "search_index_writer")).toMatch(/audience\s*=\s*var\.api_identifier/);
	});

	it("the permission is write:search-index and curate plays no part", () => {
		expect(moduleTf).toMatch(/permission\s*=\s*"write:search-index"/);
		expect(resourceBlock("auth0_resource_server_scope", "write_search_index")).toMatch(/scope\s*=\s*local\.permission/);
		expect(allTf).not.toMatch(/curate/);
	});

	it("the role is 'Search Indexer', holds the permission, and is assigned to nobody", () => {
		expect(resourceBlock("auth0_role", "search_indexer")).toMatch(/name\s*=\s*"Search Indexer"/);
		expect(resourceBlock("auth0_role_permission", "search_indexer_write_search_index")).toMatch(
			/role_id\s*=\s*auth0_role\.search_indexer\.id[\s\S]*permission\s*=\s*auth0_resource_server_scope\.write_search_index\.scope/
		);
		expect(allTf).not.toMatch(/auth0_user_roles|auth0_user_role\b|auth0_role_permissions/);
	});

	it("least privilege: an M2M-only client whose grant names exactly one scope", () => {
		const client = resourceBlock("auth0_client", "search_index_writer");
		expect(client).toMatch(/app_type\s*=\s*"non_interactive"/);
		expect(client).toMatch(/grant_types\s*=\s*\["client_credentials"\]/);
		expect(client).not.toMatch(/callbacks|allowed_origins|web_origins/);
		const grant = resourceBlock("auth0_client_grant", "search_index_writer");
		expect(grant).toMatch(/client_id\s*=\s*auth0_client\.search_index_writer\.client_id/);
		expect(grant).toMatch(/scopes\s*=\s*\[auth0_resource_server_scope\.write_search_index\.scope\]/);
		expect(grant).toMatch(/subject_type\s*=\s*"client"/);
		expect(grant).not.toMatch(/allow_all_scopes/);
	});

	it("Auth0 generates the writer's secret; it is only ever a sensitive output", () => {
		expect(resourceBlock("auth0_client_credentials", "search_index_writer")).toMatch(/authentication_method\s*=\s*"client_secret_post"/);
		expect(allTf).not.toMatch(/client_secret_wo|client_secret\s*=\s*"/);
		for (const tf of [moduleTf, productionTf, previewTf]) {
			expect(tf).toMatch(/output "client_secret"\s*\{[^}]*sensitive\s*=\s*true/);
		}
	});

	it.each([
		["production", productionTf, "cultpodcasts-auth0"],
		["preview", previewTf, "cultpodcasts-auth0-preview"]
	])("%s: state in HCP org cultpodcasts, workspace %s", (_name, tf, workspace) => {
		expect(readCloudBlock(tf)).toEqual({ organization: "cultpodcasts", workspace });
		expect(tf).toMatch(/source\s*=\s*"\.\.\/\.\.\/modules\/auth0-search-index-writer"/);
		expect(tf).toMatch(/api_identifier\s*=\s*var\.api_identifier/);
		expect(tf).toMatch(/variable "api_identifier"\s*\{[\s\S]*?default\s*=\s*"https:\/\/api\.cultpodcasts\.com\/"/);
	});

	it("never freedomtimes, S3 or R2 state", () => {
		expect(allTf).not.toMatch(/organization\s*=\s*"freedomtimes"|backend "s3"|r2\.cloudflarestorage\.com/);
	});

	it("takes the management credentials from variables (the secret ones sensitive), never literals", () => {
		for (const tf of [productionTf, previewTf]) {
			expect(tf).toMatch(/provider "auth0"\s*\{\s*domain\s*=\s*var\.auth0_domain\s*client_id\s*=\s*var\.auth0_client_id\s*client_secret\s*=\s*var\.auth0_client_secret\s*\}/);
			for (const v of ["auth0_client_id", "auth0_client_secret"]) {
				expect(tf).toMatch(new RegExp(`variable "${v}"\\s*\\{[^}]*sensitive\\s*=\\s*true`));
			}
		}
		expect(allTf).not.toMatch(/\.auth0\.com"|api_token\s*=/);
	});

	it("both roots pin the same provider and ship a lock file", () => {
		for (const dir of ["production", "preview"]) {
			const lock = readFileSync(resolve(root, `infra/terraform/auth0/${dir}/.terraform.lock.hcl`), "utf8");
			expect(lock).toContain('provider "registry.terraform.io/auth0/auth0"');
		}
		expect(allTf.match(/source\s*=\s*"auth0\/auth0"/g)).toHaveLength(3);
	});
});

describe("Auth0 stack workflow", () => {
	function job(name: string): string {
		const start = workflow.indexOf(`\n  ${name}:\n`);
		expect(start, `job ${name}`).toBeGreaterThan(-1);
		const rest = workflow.slice(start + 1);
		const next = rest.slice(1).search(/\n  [a-z-]+:\n/);
		return next === -1 ? rest : rest.slice(0, next + 1);
	}

	it("never destroys and never prints outputs (the writer's secret is in state)", () => {
		expect(workflow).not.toMatch(/terraform\s+(-chdir=\S+\s+)?destroy|-destroy\b/);
		expect(workflow).not.toMatch(/terraform\s+-chdir=\S+\s+output|\boutput -(json|raw)/);
	});

	it("preview applies the STAGING root on same-repo PRs only, in cloudflare-preview", () => {
		const j = job("preview");
		expect(j).toContain("github.event_name == 'pull_request'");
		expect(j).toContain("github.event.pull_request.head.repo.full_name == github.repository");
		expect(j).toMatch(/environment:\s*cloudflare-preview/);
		expect(j).toContain("TF_DIR: infra/terraform/auth0/preview");
		expect(j).not.toContain("auth0/production");
	});

	it("production applies only on main, behind cloudflare-production", () => {
		const j = job("apply");
		expect(j).toMatch(/environment:\s*cloudflare-production/);
		expect(j).toContain("github.ref == 'refs/heads/main'");
		expect(j).toContain("TF_DIR: infra/terraform/auth0/production");
		expect(j).not.toContain("pull_request");
		expect(workflow.match(/environment:\s*cloudflare-production/g)).toHaveLength(1);
		expect(workflow.match(/environment:\s*cloudflare-preview/g)).toHaveLength(1);
	});

	it.each([["preview"], ["apply"]])("%s: secrets check, then HCP check, init, plan, guard (--stack=auth0), apply of the saved plan", (name) => {
		const j = job(name);
		const order = [
			"Auth0 bootstrap secrets present",
			"hcp-workspace-check.mjs",
			"init -lock-timeout=5m",
			"plan -lock-timeout=5m -out=tfplan",
			'plan-guard.mjs "$RUNNER_TEMP/plan.json" --stack=auth0',
			"apply -lock-timeout=5m -input=false tfplan"
		].map((s) => j.indexOf(s));
		for (const i of order) expect(i).toBeGreaterThan(-1);
		expect(order).toEqual([...order].sort((a, b) => a - b));
		for (const v of ["TF_AUTH0_DOMAIN", "TF_AUTH0_CLIENT_ID", "TF_AUTH0_CLIENT_SECRET"]) {
			expect(j).toContain(`secrets.${v} }}`);
			expect(j).toContain(` ${v}"`);
		}
		expect(j).toMatch(/\*\.auth0\.com\) ;;/);
		expect(j).toMatch(/missing="\$missing TF_AUTH0_CLIENT_SECRET"[\s\S]*exit 1/);
	});

	it("the TF_AUTH0_* secrets are used only in the two environment jobs; readiness fails if they are repo secrets", () => {
		for (const v of ["TF_AUTH0_DOMAIN", "TF_AUTH0_CLIENT_ID", "TF_AUTH0_CLIENT_SECRET"]) {
			const all = workflow.match(new RegExp(`secrets\\.${v}\\b`, "g"))?.length ?? 0;
			const inJobs = ["preview", "apply"].reduce((n, name) => n + (job(name).match(new RegExp(`secrets\\.${v}\\b`, "g"))?.length ?? 0), 0);
			expect(inJobs, v).toBe(2);
			expect(all - inJobs, v).toBe(1);
			expect(job("readiness")).toContain(`secrets.${v} }}`);
		}
		expect(job("readiness")).toMatch(/OUTSIDE_ENVIRONMENT[\s\S]*fail=1[\s\S]*exit "\$fail"/);
	});

	it("readiness fails clearly when the HCP token or the environments are missing, and checks cloudflare-preview exists first", () => {
		const r = job("readiness");
		expect(r).toMatch(/TF_TOKEN_APP_TERRAFORM_IO is missing/);
		expect(r).toContain('gh api "repos/$REPO/environments/cloudflare-preview"');
		expect(r).toMatch(/required_reviewers[\s\S]*fail=1/);
		expect(job("preview")).toContain("needs: [validate, readiness]");
		expect(job("apply")).toContain("needs: [validate, readiness]");
	});

	it("one apply at a time per tenant, never cancelled", () => {
		expect(workflow).not.toMatch(/^concurrency:/m);
		expect(job("preview")).toMatch(/group:\s*auth0-stack-preview\s*\n\s*cancel-in-progress:\s*false/);
		expect(job("apply")).toMatch(/group:\s*auth0-stack-production\s*\n\s*cancel-in-progress:\s*false/);
	});

	it("keeps its own sticky plan comment, separate from the search plans", () => {
		expect(new Set([PLAN_MARKER, PREVIEW_PLAN_MARKER, AUTH0_PREVIEW_PLAN_MARKER]).size).toBe(3);
		expect(job("preview")).toContain(`sticky-plan-comment.mjs "$PR" "$RUNNER_TEMP/plan.md" "${AUTH0_PREVIEW_PLAN_MARKER}"`);
		expect(job("preview")).toContain(`echo "${AUTH0_PREVIEW_PLAN_MARKER}"`);
	});

	it("validates both roots without credentials", () => {
		expect(job("validate")).toMatch(/for dir in "\$TF_DIR_PRODUCTION" "\$TF_DIR_PREVIEW"/);
		expect(workflow).toContain("TF_DIR_PRODUCTION: infra/terraform/auth0/production");
		expect(workflow).toContain("TF_DIR_PREVIEW: infra/terraform/auth0/preview");
		expect(job("validate")).not.toContain("secrets.");
	});

	it("pins every third-party action to a commit SHA", () => {
		const uses = [...workflow.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
		expect(uses.length).toBeGreaterThan(0);
		for (const u of uses) expect(u, u).toMatch(/@[0-9a-f]{40}$/);
	});

	it("the search stack workflow ignores the Auth0 folders (no search redeploy or approval for an Auth0-only change)", () => {
		for (const p of ['"!infra/terraform/auth0/**"', '"!infra/terraform/modules/auth0-search-index-writer/**"']) {
			expect(searchWorkflow.split(p).length - 1, p).toBe(2);
			// After the include it negates, or GitHub would re-include it.
			expect(searchWorkflow.indexOf(p)).toBeGreaterThan(searchWorkflow.indexOf('"infra/terraform/**"'));
		}
	});
});
