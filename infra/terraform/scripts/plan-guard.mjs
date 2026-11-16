#!/usr/bin/env node
/**
 * Terraform plan guard (SP-1.10, cultpodcasts/Api#270).
 *
 * Reads `terraform show -json <planfile>` and fails when the plan would delete, replace or
 * create a protected resource (any `cloudflare_d1_database`):
 *
 * - delete: backs up `prevent_destroy`, which cannot help once the resource block is removed.
 * - replace: a forced replacement (name or location change) destroys the data.
 * - create: after the first apply, a plain create means the database vanished from state
 *   (deleted outside Terraform, or drift). Applying it would quietly make an EMPTY database
 *   with a NEW id while the Worker still points at the old one. Allowed only with
 *   `--allow-create`, which CI passes only from the manual `allow_d1_create` dispatch input
 *   (the first apply).
 *
 * Usage: node plan-guard.mjs <plan.json> [--allow-create]
 * Exit 0 = safe, 1 = forbidden change found, 2 = unreadable plan.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Resource types that must never be deleted or replaced by an automated apply. */
export const PROTECTED_RESOURCE_TYPES = Object.freeze(["cloudflare_d1_database"]);

/**
 * @param {any} plan Parsed `terraform show -json` output.
 * @param {{ allowCreate?: boolean, protectedTypes?: readonly string[] }} [options]
 * @returns {{ address: string, type: string, actions: string[], reason: string }[]}
 */
export function findForbiddenChanges(plan, options = {}) {
	const { allowCreate = false, protectedTypes = PROTECTED_RESOURCE_TYPES } = options;
	if (!plan || typeof plan !== "object" || !("format_version" in plan)) {
		throw new Error("not a terraform plan JSON document (missing format_version)");
	}
	const changes = Array.isArray(plan.resource_changes) ? plan.resource_changes : [];
	const forbidden = [];
	for (const rc of changes) {
		const actions = rc?.change?.actions ?? [];
		if (!protectedTypes.includes(rc.type)) continue;
		if (!actions.includes("delete")) {
			if (actions.includes("create") && !allowCreate) {
				forbidden.push({
					address: rc.address,
					type: rc.type,
					actions,
					reason:
						"would be CREATED. If this is not the first apply, the database was deleted outside Terraform or dropped " +
						"from state: applying would make an empty database with a new id. Investigate (D1 Time Travel, import). " +
						"For the intended first apply, run the workflow manually with allow_d1_create."
				});
			}
			continue;
		}
		const replace = actions.includes("create");
		forbidden.push({
			address: rc.address,
			type: rc.type,
			actions,
			reason: replace
				? `would be REPLACED (${actions.join(",")}); replacing a D1 database destroys its data`
				: "would be DESTROYED"
		});
	}
	return forbidden;
}

/** Plain-text summary of every planned action, for logs and the PR comment. */
export function summarisePlan(plan) {
	const changes = Array.isArray(plan?.resource_changes) ? plan.resource_changes : [];
	const lines = changes
		.filter((rc) => !(rc.change?.actions?.length === 1 && rc.change.actions[0] === "no-op"))
		.map((rc) => `${(rc.change?.actions ?? []).join(",").padEnd(14)} ${rc.address}`);
	return lines.length ? lines.join("\n") : "(no resource changes)";
}

function main(argv) {
	const args = argv.slice(2);
	const allowCreate = args.includes("--allow-create");
	const file = args.find((a) => !a.startsWith("--"));
	if (!file) {
		console.error("usage: plan-guard.mjs <plan.json> [--allow-create]");
		return 2;
	}
	let plan;
	try {
		plan = JSON.parse(readFileSync(file, "utf8"));
		const forbidden = findForbiddenChanges(plan, { allowCreate });
		console.log("Planned changes:\n" + summarisePlan(plan));
		if (forbidden.length) {
			for (const f of forbidden) console.error(`::error::${f.address} ${f.reason}`);
			console.error(
				"Plan guard: refusing. Search D1 databases must never be destroyed or replaced by Terraform, " +
					"and are created only by an explicit first apply. " +
					"If this is truly intended, it is a manual, reviewed operation outside CI (see infra/terraform/README.md)."
			);
			return 1;
		}
		console.log(
			`Plan guard: no destroy or replace of protected resources${allowCreate ? " (create allowed for this run)" : ", and no create"}.`
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
