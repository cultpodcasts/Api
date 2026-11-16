#!/usr/bin/env node
/**
 * Write Terraform-provisioned search D1 ids into wrangler.search.jsonc (SP-1.10 #270; one
 * Terraform root per stack since SP-1.11 #273, so one outputs file per stack).
 *
 * Usage (repo root, after `terraform apply`):
 *   terraform -chdir=infra/terraform/search/production output -json > /tmp/tf-production.json
 *   terraform -chdir=infra/terraform/search/preview output -json > /tmp/tf-preview.json
 *   node infra/terraform/scripts/sync-wrangler-ids.mjs /tmp/tf-production.json [/tmp/tf-preview.json …] [--config wrangler.search.jsonc]
 *     Replaces the database_id of each d1 binding whose database_name matches a stack's
 *     `database_name` output. Text edit only: comments and formatting are kept.
 *     Exit 0 = updated or in sync, 1 = error.
 *
 *   node infra/terraform/scripts/sync-wrangler-ids.mjs <tf-output.json> --migrations-config <out.json>
 *     Writes the throwaway wrangler config CI uses for `wrangler d1 migrations apply` on that
 *     ONE stack, built only from its Terraform outputs (account id, name, id), so it cannot
 *     drift from Terraform.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Map database name → id from one stack's `terraform output -json`. */
export function idsFromOutputs(outputs) {
	const name = outputs?.database_name?.value;
	const id = outputs?.database_id?.value;
	if (typeof name !== "string" || typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) {
		throw new Error(`missing or malformed terraform output database_name / database_id for ${name ?? "(unknown database)"}`);
	}
	return { [name]: id };
}

/** Folder holding the search D1 schema migrations (SP-1.1). */
export const SEARCH_MIGRATIONS_DIR = "workers/search/migrations";

/**
 * Wrangler only needs the account and the D1 bindings to apply migrations; the date is just a
 * required field for the throwaway config and does not affect `d1 migrations apply`.
 */
export const MIGRATIONS_CONFIG_COMPATIBILITY_DATE = "2026-10-01";

/**
 * Wrangler config for `wrangler d1 migrations apply <name> --remote -c <file>`, from one
 * stack's `terraform output -json` only.
 */
export function buildMigrationsConfig(outputs) {
	const accountId = outputs?.account_id?.value;
	if (typeof accountId !== "string" || !/^[0-9a-f]{32}$/i.test(accountId)) {
		throw new Error("missing or malformed terraform output account_id");
	}
	const [[name, id]] = Object.entries(idsFromOutputs(outputs));
	return {
		name: "search-migrations",
		compatibility_date: MIGRATIONS_CONFIG_COMPATIBILITY_DATE,
		account_id: accountId,
		d1_databases: [{ binding: "SEARCH_DB", database_name: name, database_id: id, migrations_dir: SEARCH_MIGRATIONS_DIR }]
	};
}

/** Local Miniflare bindings use a fixed `local-…` id (wrangler.search.jsonc env.local); never synced. */
export const LOCAL_DATABASE_ID_PREFIX = "local-";

/**
 * Set `database_id` on every d1 binding object whose `database_name` is in `ids`.
 * Bindings whose current id starts with `LOCAL_DATABASE_ID_PREFIX` (Miniflare `env.local`) are left
 * unchanged and not counted in `found`.
 * Returns the new text and which names were found.
 */
export function applyIds(text, ids) {
	const found = new Set();
	const out = text.replace(/\{[^{}]*?"database_name"\s*:\s*"([^"]+)"[^{}]*?\}/g, (block, name) => {
		if (!(name in ids)) return block;
		const current = /"database_id"\s*:\s*"([^"]*)"/.exec(block)?.[1] ?? "";
		if (current.startsWith(LOCAL_DATABASE_ID_PREFIX)) return block;
		found.add(name);
		return block.replace(/("database_id"\s*:\s*")[^"]*(")/, `$1${ids[name]}$2`);
	});
	return { text: out, found: [...found] };
}

/** @returns {{ outputs: string[], config: string, migrationsConfig?: string }} */
export function parseArgs(args) {
	const outputs = [];
	let config = "wrangler.search.jsonc";
	let migrationsConfig;
	for (let i = 0; i < args.length; i++) {
		const a = args[i];
		if (a === "--config") config = args[++i];
		else if (a === "--migrations-config") migrationsConfig = args[++i];
		else if (a.startsWith("--")) throw new Error(`unknown flag ${a}`);
		else outputs.push(a);
	}
	if (!outputs.length || !config || (migrationsConfig !== undefined && (!migrationsConfig || outputs.length !== 1))) {
		throw new Error(
			"usage: sync-wrangler-ids.mjs <tf-output.json> [<tf-output.json> …] [--config wrangler.search.jsonc]\n" +
				"       sync-wrangler-ids.mjs <tf-output.json> --migrations-config <out.json>"
		);
	}
	return { outputs, config, migrationsConfig };
}

function main(argv) {
	let args;
	try {
		args = parseArgs(argv.slice(2));
	} catch (e) {
		console.error(e instanceof Error ? e.message : e);
		return 1;
	}
	const readOutputs = (f) => JSON.parse(readFileSync(f, "utf8"));
	if (args.migrationsConfig) {
		const config = buildMigrationsConfig(readOutputs(args.outputs[0]));
		writeFileSync(args.migrationsConfig, JSON.stringify(config, null, 2) + "\n");
		console.log(`${args.migrationsConfig} written for ${config.d1_databases.map((d) => d.database_name).join(", ")}.`);
		return 0;
	}
	const configFile = args.config;
	if (!existsSync(configFile)) {
		console.error(`${configFile} not found.`);
		return 1;
	}
	const ids = Object.assign({}, ...args.outputs.map((f) => idsFromOutputs(readOutputs(f))));
	const before = readFileSync(configFile, "utf8");
	const { text, found } = applyIds(before, ids);
	const missing = Object.keys(ids).filter((n) => !found.includes(n));
	if (missing.length) {
		console.error(`no d1 binding found in ${configFile} for: ${missing.join(", ")}`);
		return 1;
	}
	if (text === before) {
		console.log(`${configFile} already has the Terraform database ids.`);
	} else {
		writeFileSync(configFile, text);
		console.log(`${configFile} updated with Terraform database ids for ${found.join(", ")}.`);
	}
	return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	process.exit(main(process.argv));
}
