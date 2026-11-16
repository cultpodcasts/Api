#!/usr/bin/env node
/**
 * Write Terraform-provisioned search D1 ids into wrangler.search.jsonc (SP-1.10).
 *
 * Usage (repo root, after `terraform apply`):
 *   terraform -chdir=infra/terraform/search-d1 output -json > /tmp/tf-out.json
 *   node infra/terraform/scripts/sync-wrangler-ids.mjs /tmp/tf-out.json [wrangler.search.jsonc]
 *     Replaces the database_id of each SEARCH_DB binding whose database_name matches a
 *     Terraform output (cultpodcasts-search, cultpodcasts-search-preview). Text edit only:
 *     comments and formatting in the JSONC file are kept. Exit 0 = updated or in sync, 1 = error.
 *
 *   node infra/terraform/scripts/sync-wrangler-ids.mjs /tmp/tf-out.json --migrations-config <out.json>
 *     Writes the throwaway wrangler config CI uses for `wrangler d1 migrations apply`, built
 *     only from Terraform outputs (account id, names, ids), so it cannot drift from Terraform.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Map database name → id from `terraform output -json`. */
export function idsFromOutputs(outputs) {
	const value = (k) => outputs?.[k]?.value;
	const pairs = [
		[value("search_database_name"), value("search_database_id")],
		[value("search_preview_database_name"), value("search_preview_database_id")]
	];
	const ids = {};
	for (const [name, id] of pairs) {
		if (typeof name !== "string" || typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) {
			throw new Error(`missing or malformed terraform output for ${name ?? "(unknown database)"}`);
		}
		ids[name] = id;
	}
	return ids;
}

/** Folder holding the search D1 schema migrations (SP-1.1). */
export const SEARCH_MIGRATIONS_DIR = "workers/search/migrations";

/**
 * Wrangler only needs the account and the D1 bindings to apply migrations; the date is just a
 * required field for the throwaway config and does not affect `d1 migrations apply`.
 */
export const MIGRATIONS_CONFIG_COMPATIBILITY_DATE = "2026-10-01";

/**
 * Wrangler config for `wrangler d1 migrations apply <name> --remote -c <file>`, from
 * `terraform output -json` only. Preview binding first, matching the CI apply order.
 */
export function buildMigrationsConfig(outputs) {
	const accountId = outputs?.account_id?.value;
	if (typeof accountId !== "string" || !/^[0-9a-f]{32}$/i.test(accountId)) {
		throw new Error("missing or malformed terraform output account_id");
	}
	const ids = idsFromOutputs(outputs);
	const binding = (bindingName, nameKey) => {
		const name = outputs[nameKey].value;
		return { binding: bindingName, database_name: name, database_id: ids[name], migrations_dir: SEARCH_MIGRATIONS_DIR };
	};
	return {
		name: "search-migrations",
		compatibility_date: MIGRATIONS_CONFIG_COMPATIBILITY_DATE,
		account_id: accountId,
		d1_databases: [
			binding("SEARCH_PREVIEW_DB", "search_preview_database_name"),
			binding("SEARCH_DB", "search_database_name")
		]
	};
}

/**
 * Set `database_id` on every d1 binding object whose `database_name` is in `ids`.
 * Returns the new text and which names were found.
 */
export function applyIds(text, ids) {
	const found = new Set();
	const out = text.replace(/\{[^{}]*?"database_name"\s*:\s*"([^"]+)"[^{}]*?\}/g, (block, name) => {
		if (!(name in ids)) return block;
		found.add(name);
		return block.replace(/("database_id"\s*:\s*")[^"]*(")/, `$1${ids[name]}$2`);
	});
	return { text: out, found: [...found] };
}

function main(argv) {
	const args = argv.slice(2);
	const mc = args.indexOf("--migrations-config");
	if (mc !== -1) {
		const outputsFile = args[0];
		const outFile = args[mc + 1];
		if (!outputsFile || !outFile || mc === 0) {
			console.error("usage: sync-wrangler-ids.mjs <terraform-output.json> --migrations-config <out.json>");
			return 1;
		}
		const config = buildMigrationsConfig(JSON.parse(readFileSync(outputsFile, "utf8")));
		writeFileSync(outFile, JSON.stringify(config, null, 2) + "\n");
		console.log(`${outFile} written for ${config.d1_databases.map((d) => d.database_name).join(", ")}.`);
		return 0;
	}
	const [outputsFile, configFile = "wrangler.search.jsonc"] = args;
	if (!outputsFile) {
		console.error("usage: sync-wrangler-ids.mjs <terraform-output.json> [wrangler.search.jsonc]");
		return 1;
	}
	if (!existsSync(configFile)) {
		console.error(`${configFile} not found (the search Worker config lands with SP-1.1, cultpodcasts/Api#219).`);
		return 1;
	}
	const ids = idsFromOutputs(JSON.parse(readFileSync(outputsFile, "utf8")));
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
