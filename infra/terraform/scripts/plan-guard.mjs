#!/usr/bin/env node
/**
 * Terraform plan guard (SP-1.10 cultpodcasts/Api#270, Worker shells SP-1.11 #273).
 *
 * Reads `terraform show -json <planfile>` for one stack (search by default, or `--stack=auth0`) and
 * fails when the plan would (search profile):
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
 * seen in review (the SP-1.11 state split, #273, used one to move the preview database out of
 * production state; those one-time blocks were removed in #275).
 *
 * `--stack=auth0` (cultpodcasts/Api#284) guards the Auth0 stacks instead: the `write:search-index`
 * permission, the Search Indexer role and its permission, the writer's M2M client, its credentials
 * and its client grant are never deleted or replaced (replacing the client issues a new client id
 * and secret and breaks the writer). Creating them is allowed: that is the first apply and a
 * rebuild from scratch, and nothing holding data is lost. A create of the client or its grant is
 * still reported as a warning: on an established tenant it means the client left state, and the
 * apply makes a second, unused app (the old one and its credentials keep working).
 * `--allow-d1-create` is search-only.
 *
 * Usage: node plan-guard.mjs <plan.json> [--stack=search|auth0] [--allow-d1-create]
 * Exit 0 = safe, 1 = forbidden change found, 2 = unreadable plan or bad arguments.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Resource types that must never be deleted or replaced by an automated apply. */
export const PROTECTED_RESOURCE_TYPES = Object.freeze(["cloudflare_d1_database", "cloudflare_worker"]);

/** Protected types whose CREATE needs `allowD1Create` (data lives in them). */
export const CREATE_GUARDED_TYPES = Object.freeze(["cloudflare_d1_database"]);

/** Auth0 stack resources that must never be deleted or replaced by an automated apply (#284). */
export const AUTH0_PROTECTED_RESOURCE_TYPES = Object.freeze([
	"auth0_resource_server",
	"auth0_resource_server_scope",
	"auth0_resource_server_scopes",
	"auth0_role",
	"auth0_role_permission",
	"auth0_role_permissions",
	"auth0_client",
	"auth0_client_credentials",
	"auth0_client_grant"
]);

/** What each stack's guard protects, selected with `--stack=<name>` (default `search`). */
export const STACKS = Object.freeze({
	search: Object.freeze({ protectedTypes: PROTECTED_RESOURCE_TYPES, createGuardedTypes: CREATE_GUARDED_TYPES }),
	auth0: Object.freeze({
		protectedTypes: AUTH0_PROTECTED_RESOURCE_TYPES,
		createGuardedTypes: Object.freeze([]),
		createWarnedTypes: Object.freeze(["auth0_client", "auth0_client_grant"])
	})
});

/** CLI flag that allows creating D1 databases. */
export const ALLOW_D1_CREATE_FLAG = "--allow-d1-create";

/** CLI flag prefix that selects the stack profile. */
export const STACK_FLAG = "--stack=";

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

/** Addresses of resources of the given types the plan CREATES (allowed, but shown). */
export function findCreates(plan, types) {
	assertPlan(plan);
	return resourceChanges(plan)
		.filter((rc) => types.includes(rc.type) && (rc?.change?.actions ?? []).includes("create"))
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
	if (type === "cloudflare_d1_database") return "a D1 database (its data)";
	if (type === "cloudflare_worker") return "the Worker shell (its deployed code)";
	if (type === "auth0_client" || type === "auth0_client_credentials") {
		return "the M2M client (a new client id/secret breaks its caller)";
	}
	return "the Auth0 permission, role or grant (access drops until it is recreated)";
}

/** @returns {{ file?: string, stack: string, allowD1Create: boolean, unknown: string[] }} */
export function parseArgs(args) {
	const flags = args.filter((a) => a.startsWith("--"));
	const stackFlags = flags.filter((f) => f.startsWith(STACK_FLAG));
	const stack = stackFlags.length === 1 ? stackFlags[0].slice(STACK_FLAG.length) : "search";
	const allowD1Create = flags.includes(ALLOW_D1_CREATE_FLAG);
	const unknown = flags.filter((f) => f !== ALLOW_D1_CREATE_FLAG && !f.startsWith(STACK_FLAG));
	if (stackFlags.length > 1) unknown.push(...stackFlags);
	else if (!Object.hasOwn(STACKS, stack)) unknown.push(stackFlags[0]);
	// D1 creates only mean something for the search stack; never let the flag look like it widened another guard.
	if (allowD1Create && stack !== "search") unknown.push(ALLOW_D1_CREATE_FLAG);
	return { file: args.find((a) => !a.startsWith("--")), stack, allowD1Create, unknown };
}

function main(argv) {
	const { file, stack, allowD1Create, unknown } = parseArgs(argv.slice(2));
	if (!file || unknown.length) {
		// An unknown flag (e.g. the old --allow-create) must not silently mean "no create allowed".
		if (unknown.length) console.error(`::error::plan guard: unknown or invalid flag(s) ${unknown.join(" ")}`);
		console.error(`usage: plan-guard.mjs <plan.json> [${STACK_FLAG}${Object.keys(STACKS).join("|")}] [${ALLOW_D1_CREATE_FLAG}]`);
		return 2;
	}
	const { protectedTypes, createGuardedTypes, createWarnedTypes = [] } = STACKS[stack];
	let plan;
	try {
		plan = JSON.parse(readFileSync(file, "utf8"));
		const forbidden = findForbiddenChanges(plan, { allowD1Create, protectedTypes, createGuardedTypes });
		console.log("Planned changes:\n" + summarisePlan(plan));
		for (const address of findForgets(plan, protectedTypes)) {
			console.log(
				`::warning title=Plan guard::${address} will be FORGOTTEN from this state only (removed block, destroy = false). ` +
					"Nothing in Cloudflare or Auth0 changes; another workspace must adopt it."
			);
		}
		for (const address of findCreates(plan, createWarnedTypes)) {
			console.log(
				`::warning title=Plan guard::${address} will be CREATED. Expected on a first apply or a rebuild; on an established ` +
					"tenant it means it left state, and the apply makes a second app or grant (see infra/terraform/auth0/README.md, Drift)."
			);
		}
		if (forbidden.length) {
			for (const f of forbidden) console.error(`::error::${f.address} ${f.reason}`);
			console.error(
				stack === "auth0"
					? "Plan guard: refusing. The Auth0 search-index permission, role, M2M client, credentials and grant are " +
							"never destroyed or replaced by Terraform. If this is truly intended, it is a manual, reviewed operation " +
							"outside CI (see infra/terraform/README.md)."
					: "Plan guard: refusing. Search D1 databases and Worker shells are never destroyed or replaced by Terraform, " +
							"and a production D1 database is created only by an explicit allow_d1_create run. " +
							"If this is truly intended, it is a manual, reviewed operation outside CI (see infra/terraform/README.md)."
			);
			return 1;
		}
		console.log(
			stack === "auth0"
				? "Plan guard (auth0): no destroy or replace of protected Auth0 resources."
				: `Plan guard: no destroy or replace of protected resources${allowD1Create ? " (D1 create allowed for this run)" : ", and no D1 create"}.`
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
