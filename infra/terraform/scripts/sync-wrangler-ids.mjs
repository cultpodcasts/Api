#!/usr/bin/env node
/**
 * Write Terraform-provisioned search D1 ids into wrangler.search.jsonc (SP-1.10).
 *
 * Usage (repo root, after `terraform apply`):
 *   terraform -chdir=infra/terraform/search-d1 output -json > /tmp/tf-out.json
 *   node infra/terraform/scripts/sync-wrangler-ids.mjs /tmp/tf-out.json [wrangler.search.jsonc]
 *
 * Replaces the database_id of each SEARCH_DB binding whose database_name matches a Terraform
 * output (cultpodcasts-search, cultpodcasts-search-preview). Text edit only: comments and
 * formatting in the JSONC file are kept. Exit 0 = updated or already in sync, 1 = error.
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
	const [outputsFile, configFile = "wrangler.search.jsonc"] = argv.slice(2);
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
