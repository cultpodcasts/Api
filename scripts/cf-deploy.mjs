#!/usr/bin/env node
// Deploy Api (and, locally, the US scrape Worker first).
//
//   npm run deploy                  → streaming-scrape-us + top-level api
//   npm run deploy -- --env preview → streaming-scrape-us-preview + api-preview
//
// Workers Builds is bound to one Worker name (api / api-preview). It refuses to
// publish streaming-scrape-us(-preview) from that connection (name mismatch).
// Under WORKERS_CI, this script only deploys Api. Publish scrape via a separate
// Builds project or: npm run deploy:scrape-us[:preview]

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const wranglerArgs = process.argv.slice(2);
const inWorkersCi = Boolean(process.env.WORKERS_CI);

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

if (!inWorkersCi) {
	const scrapeName = preview ? "streaming-scrape-us-preview" : "streaming-scrape-us";
	const scrapeScript = preview ? "deploy:scrape-us:preview" : "deploy:scrape-us";
	run("npm", ["run", scrapeScript], {
		WRANGLER_CI_OVERRIDE_NAME: scrapeName
	});
} else {
	console.log(
		"WORKERS_CI: skipping scrape Worker deploy (Builds is bound to this Api Worker name). " +
			"Ensure streaming-scrape-us(-preview) is published separately — see docs/workers-builds-deploy.md"
	);
}

run("npx", ["wrangler", "deploy", ...wranglerArgs]);
