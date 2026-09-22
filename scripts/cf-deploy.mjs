#!/usr/bin/env node
// Cloudflare Builds / ops: deploy US scrape Worker first, then Api.
//
//   npm run deploy                  → streaming-scrape-us + top-level api
//   npm run deploy -- --env preview → streaming-scrape-us-preview + api-preview
//
// Pass-through any further wrangler args after the scrape step.
//
// Workers Builds sets WRANGLER_CI_OVERRIDE_NAME to the connected Worker (e.g. api-preview).
// That must be cleared (or set to the scrape Worker name) when publishing scrape, or
// wrangler rewrites the name and the scrape bundle fails.

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const wranglerArgs = process.argv.slice(2);

function isPreviewEnv(args) {
	for (let i = 0; i < args.length; i++) {
		const a = args[i];
		if (a === "--env" && args[i + 1] === "preview") {
			return true;
		}
		if (a.startsWith("--env=") && a.slice("--env=".length) === "preview") {
			return true;
		}
	}
	return false;
}

function run(cmd, args, envExtra = {}) {
	console.log(`+ ${cmd} ${args.join(" ")}`);
	const r = spawnSync(cmd, args, {
		cwd: repoRoot,
		stdio: "inherit",
		shell: process.platform === "win32",
		env: { ...process.env, ...envExtra }
	});
	if (r.error) {
		throw r.error;
	}
	if (r.status !== 0) {
		process.exit(r.status ?? 1);
	}
}

const preview = isPreviewEnv(wranglerArgs);
const scrapeName = preview ? "streaming-scrape-us-preview" : "streaming-scrape-us";
const scrapeScript = preview ? "deploy:scrape-us:preview" : "deploy:scrape-us";

// Allow scrape Worker name to win under Workers Builds (connected to api / api-preview).
run("npm", ["run", scrapeScript], {
	WRANGLER_CI_OVERRIDE_NAME: scrapeName
});

run("npx", ["wrangler", "deploy", ...wranglerArgs]);
