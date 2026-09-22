#!/usr/bin/env node
// Cloudflare Builds / ops: deploy US scrape Worker first, then Api.
//
//   npm run deploy                  → streaming-scrape-us + top-level api
//   npm run deploy -- --env preview → streaming-scrape-us-preview + api-preview
//
// Pass-through any further wrangler args after the scrape step.

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

function run(cmd, args) {
	console.log(`+ ${cmd} ${args.join(" ")}`);
	const r = spawnSync(cmd, args, {
		cwd: repoRoot,
		stdio: "inherit",
		shell: process.platform === "win32"
	});
	if (r.error) {
		throw r.error;
	}
	if (r.status !== 0) {
		process.exit(r.status ?? 1);
	}
}

const preview = isPreviewEnv(wranglerArgs);
const scrapeScript = preview ? "deploy:scrape-us:preview" : "deploy:scrape-us";

run("npm", ["run", scrapeScript]);
run("npx", ["wrangler", "deploy", ...wranglerArgs]);
