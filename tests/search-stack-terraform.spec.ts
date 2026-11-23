import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-ignore - plain .mjs CLI helpers
import { findForbiddenChanges, findForgets, parseArgs as parseGuardArgs, summarisePlan } from "../infra/terraform/scripts/plan-guard.mjs";
// @ts-ignore - plain .mjs CLI helpers
import { applyIds, idsFromOutputs, parseArgs as parseSyncArgs } from "../infra/terraform/scripts/sync-wrangler-ids.mjs";
// @ts-ignore - plain .mjs CLI helpers
import { findPlanCommentId, PLAN_MARKER, PREVIEW_PLAN_MARKER } from "../infra/terraform/scripts/sticky-plan-comment.mjs";
// @ts-ignore - plain .mjs CLI helpers
import { DEFAULT_VERSIONS_TF, evaluateWorkspace, readCloudBlock } from "../infra/terraform/scripts/hcp-workspace-check.mjs";

/**
 * Search stack Terraform + deploy pipeline: SP-1.10 (cultpodcasts/Api#270, the D1 databases) and
 * SP-1.11 (#273: Worker shells, preview/production split, Terraform before code deploy).
 */

const root = process.cwd();
function readTf(dir: string): string {
	const abs = resolve(root, dir);
	return readdirSync(abs)
		.filter((f) => f.endsWith(".tf"))
		.map((f) => readFileSync(resolve(abs, f), "utf8"))
		.join("\n");
}
const moduleTf = readTf("infra/terraform/modules/search-stack");
const productionTf = readTf("infra/terraform/search/production");
const previewTf = readTf("infra/terraform/search/preview");
const allTf = [moduleTf, productionTf, previewTf].join("\n");
const workflow = readFileSync(resolve(root, ".github/workflows/search-stack.yml"), "utf8");
const wranglerSearch = readFileSync(resolve(root, "wrangler.search.jsonc"), "utf8");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

function plan(...changes: { type?: string; address?: string; actions: string[]; previous_address?: string; importing?: object }[]) {
	return {
		format_version: "1.2",
		resource_changes: changes.map((c, i) => ({
			address: c.address ?? `module.search.cloudflare_d1_database.db${i}`,
			type: c.type ?? "cloudflare_d1_database",
			...(c.previous_address ? { previous_address: c.previous_address } : {}),
			change: { actions: c.actions, ...(c.importing ? { importing: c.importing } : {}) }
		}))
	};
}

const WORKER = "cloudflare_worker";

describe("plan guard", () => {
	it("allows creating a D1 database only with allowD1Create (preview, or a production allow_d1_create run)", () => {
		expect(findForbiddenChanges(plan({ actions: ["create"] }), { allowD1Create: true })).toEqual([]);
	});

	it("fails on creating a D1 database without allowD1Create (it vanished from state: drift recreation)", () => {
		const forbidden = findForbiddenChanges(plan({ address: "module.search.cloudflare_d1_database.this", actions: ["create"] }));
		expect(forbidden).toEqual([
			expect.objectContaining({ address: "module.search.cloudflare_d1_database.this", reason: expect.stringMatching(/CREATED/) })
		]);
	});

	it("always allows creating a Worker shell (empty; wrangler deploys into it; needed to rebuild from scratch)", () => {
		expect(findForbiddenChanges(plan({ type: WORKER, address: "module.search.cloudflare_worker.this", actions: ["create"] }))).toEqual([]);
	});

	it.each([["cloudflare_d1_database"], [WORKER]])("never allows deleting or replacing a %s, even with allowD1Create", (type) => {
		for (const actions of [["delete"], ["delete", "create"], ["create", "delete"]]) {
			const forbidden = findForbiddenChanges(plan({ type, actions }), { allowD1Create: true });
			expect(forbidden, actions.join(",")).toHaveLength(1);
			expect(forbidden[0].reason).toMatch(actions.length === 1 ? /DESTROYED/ : /REPLACED/);
		}
	});

	it("allows in-place updates, no-ops, moves and imports", () => {
		expect(
			findForbiddenChanges(
				plan(
					{ actions: ["update"] },
					{ actions: ["no-op"], previous_address: "cloudflare_d1_database.search" },
					{ actions: ["no-op"], importing: { id: "acct/83ae1e81-bf07-4be8-aabf-2d4138959f74" } },
					{ type: WORKER, actions: ["update"] }
				)
			)
		).toEqual([]);
	});

	it("allows a forget (removed, destroy = false) but reports it", () => {
		const p = plan({ address: "cloudflare_d1_database.search_preview", actions: ["forget"] });
		expect(findForbiddenChanges(p)).toEqual([]);
		expect(findForgets(p)).toEqual(["cloudflare_d1_database.search_preview"]);
	});

	it("ignores unprotected resource types", () => {
		expect(findForbiddenChanges(plan({ type: "cloudflare_workers_kv", actions: ["delete"] }))).toEqual([]);
		expect(findForbiddenChanges(plan({ type: "cloudflare_workers_kv", actions: ["create"] }))).toEqual([]);
	});

	it("summarises moves, imports and forgets for the PR comment", () => {
		const text = summarisePlan(
			plan(
				{ address: "cloudflare_d1_database.search_preview", actions: ["forget"] },
				{ address: "module.search.cloudflare_d1_database.this", actions: ["no-op"], previous_address: "cloudflare_d1_database.search" },
				{ address: "module.search.cloudflare_d1_database.that", actions: ["no-op"], importing: { id: "x" } },
				{ address: "module.search.cloudflare_worker.this", type: WORKER, actions: ["create"] },
				{ address: "untouched", actions: ["no-op"] }
			)
		);
		expect(text).toContain("forget");
		expect(text).toContain("(moved from cloudflare_d1_database.search)");
		expect(text).toContain("import+no-op");
		expect(text).toContain("create         module.search.cloudflare_worker.this");
		expect(text).not.toContain("untouched");
	});

	it("CLI exits 1 for an unexpected D1 create, 0 with --allow-d1-create, and 2 for an unknown flag", () => {
		const dir = mkdtempSync(join(tmpdir(), "plan-guard-"));
		const file = join(dir, "plan.json");
		writeFileSync(file, JSON.stringify(plan({ actions: ["create"] })));
		const script = resolve(root, "infra/terraform/scripts/plan-guard.mjs");
		expect(spawnSync(process.execPath, [script, file]).status).toBe(1);
		expect(spawnSync(process.execPath, [script, file, "--allow-d1-create"]).status).toBe(0);
		// The pre-#273 flag must not silently turn into "no create allowed".
		expect(spawnSync(process.execPath, [script, file, "--allow-create"]).status).toBe(2);
		expect(parseGuardArgs(["p.json", "--allow-d1-create"])).toEqual({ file: "p.json", stack: "search", allowD1Create: true, unknown: [] });
	});

	it("rejects input that is not a plan", () => {
		expect(() => findForbiddenChanges({})).toThrow(/format_version/);
	});

	it("treats a plan with no resource_changes as safe", () => {
		expect(findForbiddenChanges({ format_version: "1.2" })).toEqual([]);
		expect(summarisePlan({ format_version: "1.2" })).toBe("(no resource changes)");
	});
});

describe("Terraform config: one module, two stacks", () => {
	it("the module declares one D1 database and one Worker shell, both deletion-protected", () => {
		expect(moduleTf.match(/resource "cloudflare_d1_database"/g)).toHaveLength(1);
		expect(moduleTf.match(/resource "cloudflare_worker"/g)).toHaveLength(1);
		expect(moduleTf.match(/prevent_destroy\s*=\s*true/g)).toHaveLength(2);
		expect(moduleTf).toMatch(/default\s*=\s*"weur"/);
	});

	it("keeps code out of Terraform: no script upload, versions or deployments", () => {
		expect(allTf).not.toMatch(/cloudflare_workers_script|cloudflare_worker_version|cloudflare_workers_deployment/);
		expect(allTf).not.toMatch(/content_file|main_module/);
	});

	it("the Worker shell has no public hostname and leaves wrangler-owned settings alone", () => {
		expect(moduleTf).toMatch(/subdomain\s*=\s*\{\s*enabled\s*=\s*false\s*previews_enabled\s*=\s*false/);
		expect(moduleTf).toMatch(/ignore_changes\s*=\s*\[observability/);
	});

	it("does not plan a REPLACE of an imported database for the location hint the API never returns", () => {
		expect(moduleTf).toMatch(/ignore_changes\s*=\s*\[primary_location_hint\]/);
	});

	it.each([
		["production", productionTf, "cultpodcasts-search", "search", "cultpodcasts-api-search-d1"],
		["preview", previewTf, "cultpodcasts-search-preview", "search-preview", "cultpodcasts-api-search-d1-preview"]
	])("%s root uses the module with its own names and its own HCP workspace", (_env, tf, db, worker, workspace) => {
		expect(tf).toMatch(/source\s*=\s*"\.\.\/\.\.\/modules\/search-stack"/);
		expect(tf).toContain(`database_name = "${db}"`);
		expect(tf).toMatch(new RegExp(`worker_name\\s*=\\s*"${worker}"`));
		expect(readCloudBlock(tf)).toEqual({ organization: "cultpodcasts", workspace });
	});

	it("keeps state in HCP Terraform in the cultpodcasts organisation, never freedomtimes, S3 or R2", () => {
		for (const tf of [productionTf, previewTf]) {
			expect(tf).toMatch(/cloud\s*\{\s*organization\s*=\s*"cultpodcasts"/);
		}
		expect(allTf).not.toMatch(/organization\s*=\s*"freedomtimes"/);
		expect(allTf).not.toMatch(/backend "s3"/);
		expect(allTf).not.toContain("r2.cloudflarestorage.com");
	});

	it("names in Terraform match wrangler.search.jsonc (the deploy targets the shell Terraform made)", () => {
		expect(wranglerSearch).toMatch(/^\t"name": "search",$/m);
		expect(wranglerSearch).toMatch(/"name": "search-preview"/);
		expect(wranglerSearch).toMatch(/"database_name": "cultpodcasts-search",[\s\S]*"database_id": "f3d9b5b2-7cfd-4194-8a85-e22d36aab42d"/);
		expect(wranglerSearch).toMatch(/"database_name": "cultpodcasts-search-preview",[\s\S]*"database_id": "83ae1e81-bf07-4be8-aabf-2d4138959f74"/);
	});

	it("takes the Cloudflare token from a sensitive variable", () => {
		for (const tf of [productionTf, previewTf]) {
			expect(tf).toMatch(/api_token\s*=\s*var\.cloudflare_api_token/);
			expect(tf).toMatch(/variable "cloudflare_api_token"\s*\{[^}]*sensitive\s*=\s*true/);
		}
	});

	it("contains no credentials", () => {
		expect(allTf).not.toMatch(/api_token\s*=\s*"|access_key\s*=|secret_key\s*=|token\s*=\s*"/);
	});

	it("both roots output what CI needs (database name/id, worker name, account id)", () => {
		for (const tf of [productionTf, previewTf]) {
			for (const o of ["database_name", "database_id", "worker_name", "account_id"]) expect(tf).toContain(`output "${o}"`);
			expect(tf).toMatch(/output "account_id"\s*\{\s*value\s*=\s*var\.cloudflare_account_id/);
		}
	});
});

describe("state split (#273) is finished (#275): the roots rebuild from scratch", () => {
	/** Strip `#` and `//` line comments so prose mentioning a block does not count. */
	const code = (tf: string) => tf.replace(/^\s*(#|\/\/).*$/gm, "");

	it.each([
		["production", productionTf],
		["preview", previewTf]
	])("%s has no one-time import, moved or removed blocks", (_name, tf) => {
		// An import of a fixed id fails once that database is gone, so a torn-down stack would not
		// rebuild; moved/removed blocks only belong in the PR that changes state, then come out.
		expect(code(tf)).not.toMatch(/^\s*(import|moved|removed)\s*\{/m);
	});

	it("neither root pins the adopted preview database id", () => {
		expect(allTf).not.toContain("83ae1e81-bf07-4be8-aabf-2d4138959f74");
	});

	it("both roots still declare the database and Worker shell through the shared module", () => {
		for (const tf of [productionTf, previewTf]) {
			expect(tf).toMatch(/module\s+"search"\s*\{[^}]*source\s*=\s*"\.\.\/\.\.\/modules\/search-stack"/);
		}
	});
});

describe("search stack workflow", () => {
	/** Text of one job (from its key to the next top-level job key). */
	function job(name: string): string {
		const start = workflow.indexOf(`\n  ${name}:\n`);
		expect(start, `job ${name}`).toBeGreaterThan(-1);
		const rest = workflow.slice(start + 1);
		const next = rest.slice(1).search(/\n  [a-z-]+:\n/);
		return next === -1 ? rest : rest.slice(0, next + 1);
	}

	/** Index of a step's `- name:` line in a job; -1 if missing. */
	function step(jobText: string, name: string): number {
		return jobText.indexOf(`- name: ${name}`);
	}

	/** The `paths:` list under one trigger (`pull_request` or `push`). */
	function triggerPaths(trigger: "pull_request" | "push"): string[] {
		const on = workflow.slice(workflow.indexOf("\non:\n"), workflow.indexOf("\n  workflow_dispatch:"));
		const block = on.slice(on.indexOf(`\n  ${trigger}:\n`) + 1).split(/\n  [a-z_]+:\n/)[0];
		return [...block.matchAll(/^\s+- "([^"]+)"$/gm)].map((m) => m[1]);
	}

	it("runs the preview stack on PRs that change the api bindings, but not on push to main (#221)", () => {
		expect(triggerPaths("pull_request")).toContain("wrangler.jsonc");
		expect(triggerPaths("push")).not.toContain("wrangler.jsonc");
		expect(triggerPaths("push")).toContain("wrangler.search.jsonc");
	});

	it("never runs destroy", () => {
		expect(workflow).not.toMatch(/terraform\s+(-chdir=\S+\s+)?destroy/);
		expect(workflow).not.toMatch(/-destroy\b/);
	});

	it.each([
		["preview", "--env preview", "cultpodcasts-search-preview --remote"],
		["apply", '--env=""', "cultpodcasts-search --remote"]
	])("%s: Terraform apply, then migrations, then the code deploy, in ONE job", (name, env, migration) => {
		const j = job(name);
		const plan = j.indexOf("plan -lock-timeout=5m -out=tfplan");
		const guard = j.indexOf("plan-guard.mjs");
		const apply = j.indexOf("apply -lock-timeout=5m -input=false tfplan");
		const ids = j.indexOf("prepare-deploy-config.sh");
		const migrate = j.indexOf(migration);
		const deploy = j.indexOf(`npx wrangler deploy -c "$DEPLOY_CONFIG" ${env}`);
		for (const [label, i] of Object.entries({ plan, guard, apply, ids, migrate, deploy })) expect(i, label).toBeGreaterThan(-1);
		expect(plan).toBeLessThan(guard);
		expect(guard).toBeLessThan(apply);
		expect(apply).toBeLessThan(ids);
		expect(ids).toBeLessThan(migrate);
		expect(migrate).toBeLessThan(deploy);
		// No step after the apply may be allowed to run when an earlier step failed.
		expect(j.slice(apply)).not.toMatch(/if:\s*always\(\)|continue-on-error/);
		// The deploy is the last step of the job.
		expect(j.indexOf("- name:", deploy)).toBe(-1);
	});

	it.each([["preview"], ["apply"]])("%s: npm ci (dependency install scripts) never sees the Edit or HCP token", (name) => {
		const j = job(name);
		const install = step(j, "Install wrangler");
		expect(install).toBeGreaterThan(-1);
		const installStep = j.slice(install, j.indexOf("- name:", install + 1));
		expect(installStep).toMatch(/env:\s*\n\s*TF_VAR_cloudflare_api_token: ""\s*\n\s*TF_TOKEN_app_terraform_io: ""\s*\n\s*NODE_AUTH_TOKEN: \$\{\{ secrets\.NODE_AUTH_TOKEN \}\}\s*\n\s*run: npm ci/);
		// The only secret npm ci sees is the read:packages PAT for @cultpodcasts/contracts (RedditPodcastPoster#1502).
		expect(installStep.match(/secrets\.[A-Z_]+/g)).toEqual(["secrets.NODE_AUTH_TOKEN"]);
		expect(j.match(/run: npm ci/g)).toHaveLength(1);
	});

	it("deploys nowhere else: no other job runs wrangler deploy, migrations or an apply", () => {
		expect(workflow.match(/wrangler deploy/g)).toHaveLength(2);
		expect(job("preview").match(/wrangler deploy/g)).toHaveLength(1);
		expect(job("apply").match(/wrangler deploy/g)).toHaveLength(1);
		expect(workflow).not.toMatch(/run: npm run deploy/);
		for (const name of ["validate", "readiness", "plan", "apply-skipped", "preview-id-sync", "production-id-sync"]) {
			expect(job(name)).not.toMatch(/apply -lock-timeout|wrangler (deploy|d1)/);
		}
	});

	it.each([["preview"], ["apply"]])(
		"%s: migrations and deploy use the temporary deploy config with the Terraform id; the committed file is never written (#279)",
		(name) => {
			const j = job(name);
			const ids = j.indexOf('prepare-deploy-config.sh "$RUNNER_TEMP/tf-outputs.json" "$DEPLOY_CONFIG"');
			expect(ids).toBeGreaterThan(j.indexOf('output -json > "$RUNNER_TEMP/tf-outputs.json"'));
			const wranglerRuns = [...j.matchAll(/npx wrangler [^\n]*/g)].map((m) => m[0]);
			expect(wranglerRuns).toHaveLength(2);
			for (const run of wranglerRuns) expect(run, run).toContain('-c "$DEPLOY_CONFIG"');
			expect(j).not.toMatch(/wrangler\.search\.jsonc"?\s*$|-c \.?\/?wrangler\.search\.jsonc/m);
			// Only the id check touches ids here, and it writes the copy: no direct sync, commit or push.
			expect(j).not.toContain("sync-wrangler-ids.mjs");
			expect(j).not.toMatch(/git (add|commit|push)|open-id-sync-pr|gh pr/);
			expect(j).not.toContain("contents: write");
			expect(j).toMatch(/- id: ids\n\s*name: Deploy config with the Terraform database id/);
			expect(j).toContain("ids_match: ${{ steps.ids.outputs.ids_match }}");
		}
	);

	it("the deploy config is a gitignored copy next to wrangler.search.jsonc", () => {
		expect(workflow).toContain("  DEPLOY_CONFIG: .wrangler.search.deploy.jsonc\n");
		expect(readFileSync(resolve(root, ".gitignore"), "utf8").split(/\r?\n/)).toContain(".wrangler.search.deploy.jsonc");
	});

	it.each([
		["preview-id-sync", "preview", "needs.preview.outputs"],
		["production-id-sync", "production", "needs.apply.outputs"]
	])("%s: opens the %s id sync PR only after the stack job succeeded with a differing committed id (#279)", (name, stack, outputs) => {
		const j = job(name);
		expect(j).toContain(`needs: [${stack === "preview" ? "preview" : "apply"}]`);
		// No status function, so GitHub adds success(): it never runs after a failed apply/deploy.
		expect(j).toContain(`if: ${outputs}.ids_match == 'false'`);
		expect(j).not.toMatch(/always\(\)|failure\(\)|continue-on-error/);
		expect(j).toMatch(/permissions:\s*\n\s*contents: write\s*\n\s*pull-requests: write/);
		expect(j).toMatch(new RegExp(`concurrency:\\s*\\n\\s*group: search-stack-id-sync-${stack}\\s*\\n\\s*cancel-in-progress: false`));
		expect(j).toMatch(/ref: main\s*\n\s*fetch-depth: 0/);
		expect(j).toContain(`open-id-sync-pr.sh" ${stack} "$RUNNER_TEMP/tf-ids.json"`);
		// No Cloudflare/HCP secrets, no environment, no npm install scripts next to the write token.
		expect(j).not.toMatch(/secrets\.|environment:|npm (ci|install)/);
		expect(j).toContain("GH_TOKEN: ${{ github.token }}");
	});

	it("grants contents: write only to the id sync jobs", () => {
		expect(workflow.match(/contents: write/g)).toHaveLength(2);
		expect(workflow).toMatch(/^permissions:\n  contents: read\n/m);
	});

	it("preview runs on same-repo PRs only, in cloudflare-preview, with its own token", () => {
		const j = job("preview");
		expect(j).toContain("github.event_name == 'pull_request'");
		expect(j).toContain("github.event.pull_request.head.repo.full_name == github.repository");
		expect(j).toContain("needs.readiness.outputs.preview_ready == 'true'");
		expect(j).toMatch(/environment:\s*cloudflare-preview/);
		expect(j).toContain("TF_DIR: infra/terraform/search/preview");
		expect(j).toContain("TF_VAR_cloudflare_api_token: ${{ secrets.TF_PREVIEW_CLOUDFLARE_API_TOKEN }}");
		expect(j).not.toMatch(/TF_APPLY_CLOUDFLARE_API_TOKEN|TF_PLAN_CLOUDFLARE_API_TOKEN/);
		expect(j).not.toContain("cultpodcasts-search --remote");
	});

	it("production applies only on main, behind cloudflare-production, with the apply token", () => {
		const j = job("apply");
		expect(j).toMatch(/environment:\s*cloudflare-production/);
		expect(j).toContain("github.ref == 'refs/heads/main'");
		expect(j).toContain("needs.readiness.outputs.apply_protected == 'true'");
		expect(j).toContain("TF_DIR: infra/terraform/search/production");
		expect(j).toContain("TF_VAR_cloudflare_api_token: ${{ secrets.TF_APPLY_CLOUDFLARE_API_TOKEN }}");
		expect(j).not.toMatch(/TF_PREVIEW_CLOUDFLARE_API_TOKEN|cultpodcasts-search-preview/);
		expect(j).not.toContain("pull_request");
	});

	it("PRs only PLAN production, with the read-only token", () => {
		const j = job("plan");
		expect(j).toContain("TF_DIR: infra/terraform/search/production");
		expect(j).toContain("TF_VAR_cloudflare_api_token: ${{ secrets.TF_PLAN_CLOUDFLARE_API_TOKEN }}");
		expect(j).not.toMatch(/TF_APPLY_CLOUDFLARE_API_TOKEN|TF_PREVIEW_CLOUDFLARE_API_TOKEN|environment:/);
	});

	it("Edit tokens are only used inside their environment's job; readiness fails if either is a repo secret", () => {
		for (const [secret, owner] of [
			["TF_APPLY_CLOUDFLARE_API_TOKEN", "apply"],
			["TF_PREVIEW_CLOUDFLARE_API_TOKEN", "preview"]
		]) {
			const all = workflow.match(new RegExp(`secrets\\.${secret}`, "g"))?.length ?? 0;
			const inOwner = job(owner).match(new RegExp(`secrets\\.${secret}`, "g"))?.length ?? 0;
			expect(all - inOwner, secret).toBe(1); // the readiness "not visible outside the environment" check
		}
		expect(job("readiness")).toMatch(/APPLY_TOKEN_OUTSIDE_ENVIRONMENT[\s\S]*exit 1/);
		expect(job("readiness")).toMatch(/PREVIEW_TOKEN_OUTSIDE_ENVIRONMENT[\s\S]*exit 1/);
		expect(workflow).not.toMatch(/secrets\.TF_VAR_CLOUDFLARE_API_TOKEN|secrets\.CLOUDFLARE_API_TOKEN\b/);
	});

	it("never names cloudflare-preview before checking it exists (a job would create it unprotected)", () => {
		expect(job("readiness")).toContain('gh api "repos/$REPO/environments/cloudflare-preview"');
		expect(workflow.match(/environment:\s*cloudflare-preview/g)).toHaveLength(1);
	});

	it("authenticates to HCP like freedomtimes, with no R2/AWS secrets", () => {
		expect(workflow).toContain("TF_TOKEN_app_terraform_io: ${{ secrets.TF_TOKEN_APP_TERRAFORM_IO }}");
		expect(workflow).not.toMatch(/AWS_|R2_/);
	});

	it("serialises: one preview apply at a time, production applies queue, only PR plans cancel", () => {
		expect(workflow).not.toMatch(/^concurrency:/m);
		expect(job("preview")).toMatch(/concurrency:\s*\n\s*group:\s*search-stack-preview\s*\n\s*cancel-in-progress:\s*false/);
		expect(job("apply")).toMatch(/concurrency:\s*\n\s*group:\s*search-stack-production\s*\n\s*cancel-in-progress:\s*false/);
		expect(job("plan")).toContain(
			"group: search-stack-plan-${{ github.event_name }}-${{ github.event.pull_request.number || github.ref }}"
		);
		expect(job("plan")).toContain("cancel-in-progress: ${{ github.event_name == 'pull_request' }}");
		expect(workflow.match(/-lock-timeout=5m/g)?.length).toBeGreaterThanOrEqual(7);
	});

	it("D1 create: always allowed on preview (rebuilds itself), production only from the manual allow_d1_create input", () => {
		expect(workflow).toMatch(/allow_d1_create:\s*\n[\s\S]*?type:\s*boolean\s*\n\s*default:\s*false/);
		expect(workflow).toContain(
			"PLAN_GUARD_FLAGS: ${{ (github.event_name == 'workflow_dispatch' && inputs.allow_d1_create) && '--allow-d1-create' || '' }}"
		);
		expect(job("preview")).toContain('plan-guard.mjs "$RUNNER_TEMP/plan.json" --allow-d1-create');
		for (const name of ["plan", "apply"]) {
			expect(job(name)).toContain('plan-guard.mjs "$RUNNER_TEMP/plan.json" $PLAN_GUARD_FLAGS');
			expect(job(name)).not.toMatch(/plan-guard\.mjs[^\n]*--allow/);
		}
		expect(workflow).not.toContain("--allow-create");
	});

	it("checks the HCP workspace is Local before every init", () => {
		for (const name of ["plan", "preview", "apply"]) {
			const j = job(name);
			expect(j.indexOf("hcp-workspace-check.mjs")).toBeGreaterThan(-1);
			expect(j.indexOf("hcp-workspace-check.mjs")).toBeLessThan(j.indexOf("init -lock-timeout"));
		}
	});

	it("validates both stacks without credentials", () => {
		expect(job("validate")).toMatch(/for dir in "\$TF_DIR_PRODUCTION" "\$TF_DIR_PREVIEW"/);
		expect(workflow).toContain("TF_DIR_PRODUCTION: infra/terraform/search/production");
		expect(workflow).toContain("TF_DIR_PREVIEW: infra/terraform/search/preview");
	});

	it("keeps one sticky plan comment per PR and stack, with the head SHA", () => {
		expect(job("plan")).toContain('sticky-plan-comment.mjs "$PR" "$RUNNER_TEMP/plan.md"');
		expect(job("plan")).toContain(PLAN_MARKER);
		expect(job("preview")).toContain(`sticky-plan-comment.mjs "$PR" "$RUNNER_TEMP/plan.md" "${PREVIEW_PLAN_MARKER}"`);
		expect(workflow).not.toContain("--edit-last");
		expect(workflow).toContain("github.event.pull_request.head.sha");
		// Posted before the apply, so it must not claim the deploy already happened.
		expect(job("preview")).not.toMatch(/applied and deployed by this PR run/);
	});

	it("hard-codes no account id (the deploy config takes it from wrangler.search.jsonc, checked against Terraform)", () => {
		expect(workflow).not.toContain("bae3f835f19899c6eee1ec48f2d658cf");
	});

	it("triggers on search code and config, not on every package.json version bump", () => {
		for (const p of ['"infra/terraform/**"', '"workers/search/**"', '"wrangler.search.jsonc"', '".github/workflows/search-stack.yml"']) {
			expect(workflow.split(p).length - 1, p).toBe(2);
		}
		expect(workflow).not.toMatch(/- "package(-lock)?\.json"/);
	});

	it("pins every third-party action to a commit SHA", () => {
		const uses = [...workflow.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
		expect(uses.length).toBeGreaterThan(0);
		for (const u of uses) expect(u, u).toMatch(/@[0-9a-f]{40}$/);
	});

	it("the npm deploy scripts target the same wrangler envs as the CI deploy steps", () => {
		expect(packageJson.scripts["deploy:search"]).toBe('wrangler deploy -c ./wrangler.search.jsonc --env=""');
		expect(packageJson.scripts["deploy:search:preview"]).toBe("wrangler deploy -c ./wrangler.search.jsonc --env preview");
	});
});

describe("prepare-deploy-config.sh (deploy config with the Terraform id, #279)", () => {
	const script = resolve(root, "infra/terraform/scripts/prepare-deploy-config.sh");
	const committedPreviewId = "83ae1e81-bf07-4be8-aabf-2d4138959f74";
	const rebuiltId = "00000000-bf07-4be8-aabf-2d4138959f74";

	/** A scratch repo root holding a copy of the committed wrangler.search.jsonc. */
	function scratch(outputs: object) {
		const dir = mkdtempSync(join(tmpdir(), "check-ids-"));
		writeFileSync(join(dir, "wrangler.search.jsonc"), wranglerSearch);
		writeFileSync(join(dir, "out.json"), JSON.stringify(outputs));
		writeFileSync(join(dir, "gh-output"), "");
		const run = (deployConfig = ".wrangler.search.deploy.jsonc") =>
			spawnSync("bash", [script, "out.json", deployConfig], {
				cwd: dir,
				env: { ...process.env, GITHUB_STEP_SUMMARY: "", GITHUB_OUTPUT: join(dir, "gh-output") }
			});
		const read = (f: string) => readFileSync(join(dir, f), "utf8");
		return { dir, run, read };
	}
	const previewOutputs = (id: string, account = "bae3f835f19899c6eee1ec48f2d658cf") => ({
		database_name: { value: "cultpodcasts-search-preview" },
		database_id: { value: id },
		account_id: { value: account }
	});

	it("ids match: the deploy config is an exact copy, ids_match=true, no warning", () => {
		const s = scratch(previewOutputs(committedPreviewId));
		const r = s.run();
		expect(r.status, r.stderr.toString()).toBe(0);
		expect(r.stdout.toString()).not.toContain("::warning");
		expect(s.read(".wrangler.search.deploy.jsonc")).toBe(wranglerSearch);
		expect(s.read("gh-output")).toBe(`ids_match=true\ndatabase_name=cultpodcasts-search-preview\ndatabase_id=${committedPreviewId}\n`);
	});

	it("rebuilt stack: warns (exit 0), the deploy config gets the new id, the committed file is untouched", () => {
		const s = scratch(previewOutputs(rebuiltId));
		const r = s.run();
		expect(r.status, r.stderr.toString()).toBe(0);
		expect(r.stdout.toString()).toContain("::warning title=wrangler.search.jsonc::");
		expect(r.stdout.toString()).not.toContain("::error");
		expect(s.read("wrangler.search.jsonc")).toBe(wranglerSearch);
		const deployConfig = s.read(".wrangler.search.deploy.jsonc");
		expect(deployConfig).toContain(`"database_id": "${rebuiltId}"`);
		expect(deployConfig).not.toContain(committedPreviewId);
		// Only the preview binding changes: production and the `local-` binding keep their ids.
		expect(deployConfig).toBe(wranglerSearch.replace(committedPreviewId, rebuiltId));
		expect(deployConfig).toContain('"database_id": "local-cultpodcasts-search"');
		expect(s.read("gh-output")).toContain("ids_match=false\n");
		expect(s.read("gh-output")).toContain(`database_id=${rebuiltId}\n`);
	});

	it("refuses a deploy config outside the config's folder (wrangler paths are relative) or the committed file itself", () => {
		const s = scratch(previewOutputs(rebuiltId));
		mkdirSync(join(s.dir, "sub"));
		expect(s.run("sub/deploy.jsonc").status).toBe(1);
		expect(s.run("wrangler.search.jsonc").status).toBe(1);
		expect(s.run("./wrangler.search.jsonc").status).toBe(1);
		expect(s.read("wrangler.search.jsonc")).toBe(wranglerSearch);
	});

	it("fails on a Terraform account other than the committed one, or malformed outputs", () => {
		expect(scratch(previewOutputs(committedPreviewId, "0123456789abcdef0123456789abcdef")).run().status).toBe(1);
		expect(scratch(previewOutputs("nope")).run().status).toBe(1);
		expect(scratch({ database_name: { value: "unknown-db" }, database_id: { value: rebuiltId } }).run().status).toBe(1);
	});
});

describe("open-id-sync-pr.sh (#279)", () => {
	const script = resolve(root, "infra/terraform/scripts/open-id-sync-pr.sh");
	const syncScript = resolve(root, "infra/terraform/scripts/sync-wrangler-ids.mjs");
	const committedPreviewId = "83ae1e81-bf07-4be8-aabf-2d4138959f74";
	const branch = "ci/sync-search-d1-id-preview";

	function git(cwd: string, ...args: string[]) {
		const r = spawnSync("git", args, { cwd });
		expect(r.status, `git ${args.join(" ")}: ${r.stderr}`).toBe(0);
		return r.stdout.toString().trim();
	}

	/** A bare "origin" with main holding wrangler.search.jsonc, a clone, and a fake gh logging its calls. */
	function setup() {
		const dir = mkdtempSync(join(tmpdir(), "id-sync-"));
		const origin = join(dir, "origin.git");
		const clone = join(dir, "clone");
		git(dir, "init", "--quiet", "--bare", "-b", "main", origin);
		git(dir, "clone", "--quiet", origin, clone);
		for (const [k, v] of [["user.name", "t"], ["user.email", "t@example.com"]]) git(clone, "config", k, v);
		writeFileSync(join(clone, "wrangler.search.jsonc"), wranglerSearch);
		writeFileSync(join(clone, "README.md"), "x\n");
		git(clone, "add", ".");
		git(clone, "commit", "--quiet", "-m", "init");
		git(clone, "push", "--quiet", "origin", "HEAD:main");
		const bin = join(dir, "bin");
		mkdirSync(bin);
		writeFileSync(
			join(bin, "gh"),
			`#!/usr/bin/env bash\necho "$*" >> "${join(dir, "gh.log")}"\nif [ "$1 $2" = "pr list" ]; then cat "${join(dir, "open-pr")}" 2>/dev/null; fi\nif [ "$1 $2" = "pr create" ]; then [ -f "${join(dir, "refuse-create")}" ] && { echo "GitHub Actions is not permitted to create or approve pull requests" >&2; exit 1; }; echo https://github.com/o/r/pull/9; fi\n`
		);
		chmodSync(join(bin, "gh"), 0o755);
		const run = (id: string) => {
			const outputs = join(dir, "ids.json");
			writeFileSync(outputs, JSON.stringify({ database_name: { value: "cultpodcasts-search-preview" }, database_id: { value: id } }));
			return spawnSync("bash", [script, "preview", outputs, syncScript], {
				cwd: clone,
				env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_REPOSITORY: "o/r", GITHUB_STEP_SUMMARY: "", GH_TOKEN: "x" }
			});
		};
		const ghLog = () => {
			try {
				return readFileSync(join(dir, "gh.log"), "utf8");
			} catch {
				return "";
			}
		};
		const remoteBranch = () => spawnSync("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], { cwd: origin }).stdout.toString().trim();
		const fileOn = (ref: string) => git(origin, "show", `${ref}:wrangler.search.jsonc`);
		return { dir, origin, clone, run, ghLog, remoteBranch, fileOn };
	}

	it("does nothing when main already binds the Terraform id: no branch, no PR", () => {
		const s = setup();
		const r = s.run(committedPreviewId);
		expect(r.status, r.stderr.toString()).toBe(0);
		expect(r.stdout.toString()).toContain("no sync PR needed");
		expect(s.remoteBranch()).toBe("");
		// Only the read-only lookup for a stale open sync PR.
		expect(s.ghLog()).not.toMatch(/pr (create|close|edit)/);
		expect(r.stdout.toString()).not.toContain("::notice");
	});

	it("opens one PR to main from the fixed branch with only the new id, then never a duplicate", () => {
		const s = setup();
		const newId = "11111111-bf07-4be8-aabf-2d4138959f74";
		const r = s.run(newId);
		expect(r.status, r.stderr.toString()).toBe(0);
		expect(s.fileOn(branch)).toBe(wranglerSearch.replace(committedPreviewId, newId).trim());
		expect(s.fileOn("main")).toBe(wranglerSearch.trim());
		expect(s.ghLog().match(/^pr create /gm)).toHaveLength(1);
		expect(s.ghLog()).toMatch(/pr create --repo o\/r --base main --head ci\/sync-search-d1-id-preview /);
		const head = s.remoteBranch();

		// Second run while that PR is open: same id, so no new commit and no second PR.
		writeFileSync(join(s.dir, "open-pr"), "https://github.com/o/r/pull/9\n");
		const again = s.run(newId);
		expect(again.status, again.stderr.toString()).toBe(0);
		expect(again.stdout.toString()).toContain("Updated the open id sync PR");
		expect(s.remoteBranch()).toBe(head);
		expect(s.ghLog().match(/^pr create /gm)).toHaveLength(1);
	});

	it("a later rebuild updates the existing branch fast-forward (merge commit, never a force-push)", () => {
		const s = setup();
		s.run("11111111-bf07-4be8-aabf-2d4138959f74");
		const first = s.remoteBranch();
		// main moves on meanwhile
		git(s.clone, "switch", "--quiet", "-C", "main", "origin/main");
		writeFileSync(join(s.clone, "README.md"), "y\n");
		git(s.clone, "commit", "--quiet", "-am", "main moves");
		git(s.clone, "push", "--quiet", "origin", "HEAD:main");
		const secondId = "22222222-bf07-4be8-aabf-2d4138959f74";
		const r = s.run(secondId);
		expect(r.status, r.stderr.toString()).toBe(0);
		const second = s.remoteBranch();
		expect(second).not.toBe(first);
		// The old head is an ancestor of the new one: nothing was rewritten.
		expect(spawnSync("git", ["merge-base", "--is-ancestor", first, second], { cwd: s.origin }).status).toBe(0);
		expect(spawnSync("git", ["merge-base", "--is-ancestor", "main", second], { cwd: s.origin }).status).toBe(0);
		expect(s.fileOn(branch)).toContain(secondId);
	});

	it("flags (never closes) an open sync PR that main no longer needs", () => {
		const s = setup();
		writeFileSync(join(s.dir, "open-pr"), "https://github.com/o/r/pull/9\n");
		const r = s.run(committedPreviewId);
		expect(r.status, r.stderr.toString()).toBe(0);
		expect(r.stdout.toString()).toContain("::notice title=Search D1 id sync::main already has the preview id; the open sync PR https://github.com/o/r/pull/9 is no longer needed.");
		expect(s.ghLog()).not.toMatch(/pr (close|create|edit)/);
		expect(s.remoteBranch()).toBe("");
	});

	it("when GitHub refuses the PR (Actions may not create PRs), still pushes the branch and warns with a compare link, exit 0", () => {
		const s = setup();
		writeFileSync(join(s.dir, "refuse-create"), "");
		const newId = "33333333-bf07-4be8-aabf-2d4138959f74";
		const r = s.run(newId);
		expect(r.status, r.stderr.toString()).toBe(0);
		expect(r.stdout.toString()).toContain("::warning title=Search D1 id sync::Pushed ci/sync-search-d1-id-preview but could not open the PR");
		expect(r.stdout.toString()).toContain("https://github.com/o/r/compare/main...ci/sync-search-d1-id-preview?expand=1");
		expect(s.ghLog().match(/^pr create /gm)).toHaveLength(1);
		expect(s.fileOn(branch)).toContain(newId);
	});

	it("rejects an unknown stack", () => {
		const s = setup();
		const outputs = join(s.dir, "x.json");
		writeFileSync(outputs, "{}");
		expect(spawnSync("bash", [script, "staging", outputs], { cwd: s.clone }).status).toBe(2);
	});
});

describe("sync-wrangler-ids", () => {
	const production = {
		database_name: { value: "cultpodcasts-search" },
		database_id: { value: "11111111-2222-3333-4444-555555555555" }
	};
	const preview = {
		database_name: { value: "cultpodcasts-search-preview" },
		database_id: { value: "66666666-7777-8888-9999-000000000000" }
	};
	const config = `{
	"d1_databases": [
		{
			"binding": "SEARCH_DB",
			"database_name": "cultpodcasts-search",
			// comment kept
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
		{ "binding": "SEARCH_DB", "database_name": "cultpodcasts-search", "database_id": "local-cultpodcasts-search" }
	] } }
}`;

	it("one stack's outputs update only that stack's binding", () => {
		const { text, found } = applyIds(config, idsFromOutputs(preview));
		expect(found).toEqual(["cultpodcasts-search-preview"]);
		expect(text).toContain('"database_id": "66666666-7777-8888-9999-000000000000"');
		expect(text).toContain("PLACEHOLDER-cultpodcasts-search-database-id");
	});

	it("both stacks' outputs together update both, keep comments, and leave the same-named local binding alone", () => {
		const { text, found } = applyIds(config, { ...idsFromOutputs(production), ...idsFromOutputs(preview) });
		expect(found.sort()).toEqual(["cultpodcasts-search", "cultpodcasts-search-preview"]);
		expect(text).toContain('"database_id": "11111111-2222-3333-4444-555555555555"');
		expect(text).toContain("// comment kept");
		expect(text).toContain('"database_id": "local-cultpodcasts-search"');
		expect(text).not.toContain("PLACEHOLDER-");
	});

	it("is idempotent", () => {
		const ids = idsFromOutputs(production);
		const once = applyIds(config, ids).text;
		expect(applyIds(once, ids).text).toBe(once);
	});

	it("rejects missing or malformed outputs", () => {
		expect(() => idsFromOutputs({ ...production, database_id: { value: "nope" } })).toThrow(/malformed/);
		expect(() => idsFromOutputs({})).toThrow();
	});

	it("parses one or more outputs files and --config", () => {
		expect(parseSyncArgs(["a.json", "b.json"])).toEqual({ outputs: ["a.json", "b.json"], config: "wrangler.search.jsonc" });
		expect(parseSyncArgs(["a.json", "--config", "w.jsonc"]).config).toBe("w.jsonc");
		expect(() => parseSyncArgs(["a.json", "--migrations-config", "m.json"])).toThrow(/unknown flag/);
		expect(() => parseSyncArgs([])).toThrow(/usage/);
		expect(() => parseSyncArgs(["a.json", "--bogus"])).toThrow(/unknown flag/);
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

	it("keeps the production and preview plan comments apart by marker", () => {
		const comments = [plan(50, "prod"), { id: 51, user: bot, body: `${PREVIEW_PLAN_MARKER}\n### preview` }];
		expect(PREVIEW_PLAN_MARKER).not.toBe(PLAN_MARKER);
		expect(findPlanCommentId(comments)).toBe(50);
		expect(findPlanCommentId(comments, PREVIEW_PLAN_MARKER)).toBe(51);
	});
});

describe("HCP workspace check", () => {
	it("reads the organisation and workspace from the single cloud block", () => {
		const versions = readFileSync(resolve(root, DEFAULT_VERSIONS_TF), "utf8");
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
