#!/usr/bin/env node
/**
 * Terraform plan guard (SP-1.10 cultpodcasts/Api#270, Worker shells SP-1.11 #273).
 *
 * Reads `terraform show -json <planfile>` for one search stack and fails when the plan would:
 *
 * - DELETE or REPLACE a protected resource (`cloudflare_d1_database`, `cloudflare_worker`).
 *   Backs up `prevent_destroy`, which cannot help once the resource block is removed from the
 *   config. Replacing a D1 database destroys its data; replacing the Worker shell would drop the
 *   deployed code and the service binding target.
 * - CREATE a D1 database, unless `--allow-d1-create`. Once a database exists, a plain create
 *   means it vanished from state (deleted outside Terraform, or drift): applying would quietly
 *   make an EMPTY database with a NEW id while the Worker still points at the old one.
 *   CI passes the flag only on the preview stack (its data is a resyncable copy, so CI rebuilds a
 *   torn-down preview stack by itself) and on production only from the manual `allow_d1_create`
 *   dispatch input (first apply, or a deliberate rebuild from scratch).
 *
 * Creating a Worker SHELL is always allowed: it is empty, wrangler deploys the code into it in
 * the same job, and it is exactly what a rebuild from scratch needs. If a Worker with that name
 * already exists outside state, the create fails loudly at apply (name taken); nothing is lost.
 *
 * `forget` (a `removed { lifecycle { destroy = false } }` block) only drops the resource from
 * this state and never touches Cloudflare; it is allowed and reported as a warning so it is
 * seen in review (the SP-1.11 state split forgets the preview database from production state).
 *
 * Usage: node plan-guard.mjs <plan.json> [--allow-d1-create]
 * Exit 0 = safe, 1 = forbidden change found, 2 = unreadable plan or bad arguments.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Resource types that must never be deleted or replaced by an automated apply. */
export const PROTECTED_RESOURCE_TYPES = Object.freeze(["cloudflare_d1_database", "cloudflare_worker"]);

/** Protected types whose CREATE needs `allowD1Create` (data lives in them). */
export const CREATE_GUARDED_TYPES = Object.freeze(["cloudflare_d1_database"]);

/** CLI flag that allows creating D1 databases. */
export const ALLOW_D1_CREATE_FLAG = "--allow-d1-create";

/**
 * @param {any} plan Parsed `terraform show -json` output.
 * @param {{ allowD1Create?: boolean, protectedTypes?: readonly string[], createGuardedTypes?: readonly string[] }} [options]
 * @returns {{ address: string, type: string, actions: string[], reason: string }[]}
 */
export function findForbiddenChanges(plan, options = {}) {
	const {
		allowD1Create = false,
		protectedTypes = PROTECTED_RESOURCE_TYPES,
		createGuardedTypes = CREATE_GUARDED_TYPES
	} = options;
	assertPlan(plan);
	const forbidden = [];
	for (const rc of resourceChanges(plan)) {
		const actions = rc?.change?.actions ?? [];
		if (!protectedTypes.includes(rc.type)) continue;
		if (actions.includes("delete")) {
			const replace = actions.includes("create");
			forbidden.push({
				address: rc.address,
				type: rc.type,
				actions,
				reason: replace
					? `would be REPLACED (${actions.join(",")}); replacing ${describe(rc.type)} destroys it`
					: "would be DESTROYED"
			});
			continue;
		}
		if (actions.includes("create") && createGuardedTypes.includes(rc.type) && !allowD1Create) {
			forbidden.push({
				address: rc.address,
				type: rc.type,
				actions,
				reason:
					"would be CREATED. If this database existed, it was deleted outside Terraform or dropped from state: " +
					"applying would make an empty database with a new id. Investigate (D1 Time Travel, import). " +
					"For an intended production create (first apply, or rebuild from scratch), run the workflow manually " +
					"on main with allow_d1_create."
			});
		}
	}
	return forbidden;
}

/** Protected resources the plan only forgets (`removed { destroy = false }`): allowed, but shown. */
export function findForgets(plan, protectedTypes = PROTECTED_RESOURCE_TYPES) {
	assertPlan(plan);
	return resourceChanges(plan)
		.filter((rc) => protectedTypes.includes(rc.type) && (rc?.change?.actions ?? []).includes("forget"))
		.map((rc) => rc.address);
}

/** Plain-text summary of every planned action, for logs and the PR comment. */
export function summarisePlan(plan) {
	const lines = resourceChanges(plan)
		.filter((rc) => !(rc.change?.actions?.length === 1 && rc.change.actions[0] === "no-op" && !rc.change?.importing && !rc.previous_address))
		.map((rc) => {
			const actions = (rc.change?.actions ?? []).join(",");
			const label = rc.change?.importing ? `import+${actions}` : actions;
			const moved = rc.previous_address ? ` (moved from ${rc.previous_address})` : "";
			return `${label.padEnd(14)} ${rc.address}${moved}`;
		});
	return lines.length ? lines.join("\n") : "(no resource changes)";
}

function assertPlan(plan) {
	if (!plan || typeof plan !== "object" || !("format_version" in plan)) {
		throw new Error("not a terraform plan JSON document (missing format_version)");
	}
}

function resourceChanges(plan) {
	return Array.isArray(plan?.resource_changes) ? plan.resource_changes : [];
}

function describe(type) {
	return type === "cloudflare_d1_database" ? "a D1 database (its data)" : "the Worker shell (its deployed code)";
}

/** @returns {{ file?: string, allowD1Create: boolean, unknown: string[] }} */
export function parseArgs(args) {
	const flags = args.filter((a) => a.startsWith("--"));
	return {
		file: args.find((a) => !a.startsWith("--")),
		allowD1Create: flags.includes(ALLOW_D1_CREATE_FLAG),
		unknown: flags.filter((f) => f !== ALLOW_D1_CREATE_FLAG)
	};
}

function main(argv) {
	const { file, allowD1Create, unknown } = parseArgs(argv.slice(2));
	if (!file || unknown.length) {
		// An unknown flag (e.g. the old --allow-create) must not silently mean "no create allowed".
		if (unknown.length) console.error(`::error::plan guard: unknown flag(s) ${unknown.join(" ")}`);
		console.error(`usage: plan-guard.mjs <plan.json> [${ALLOW_D1_CREATE_FLAG}]`);
		return 2;
	}
	let plan;
	try {
		plan = JSON.parse(readFileSync(file, "utf8"));
		const forbidden = findForbiddenChanges(plan, { allowD1Create });
		console.log("Planned changes:\n" + summarisePlan(plan));
		for (const address of findForgets(plan)) {
			console.log(
				`::warning title=Plan guard::${address} will be FORGOTTEN from this state only (removed block, destroy = false). ` +
					"Nothing in Cloudflare changes; another workspace must adopt it."
			);
		}
		if (forbidden.length) {
			for (const f of forbidden) console.error(`::error::${f.address} ${f.reason}`);
			console.error(
				"Plan guard: refusing. Search D1 databases and Worker shells are never destroyed or replaced by Terraform, " +
					"and a production D1 database is created only by an explicit allow_d1_create run. " +
					"If this is truly intended, it is a manual, reviewed operation outside CI (see infra/terraform/README.md)."
			);
			return 1;
		}
		console.log(
			`Plan guard: no destroy or replace of protected resources${allowD1Create ? " (D1 create allowed for this run)" : ", and no D1 create"}.`
		);
		return 0;
	} catch (e) {
		console.error(`::error::plan guard could not read ${file}: ${e instanceof Error ? e.message : e}`);
		return 2;
	}
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	process.exit(main(process.argv));
}
