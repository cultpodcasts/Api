// Publish @cultpodcasts/streaming-submit-contract to GitHub Packages
//
// Usage:
//   node ./scripts/publish-streaming-submit-contract.mjs production
//   node ./scripts/publish-streaming-submit-contract.mjs staging
//   node ./scripts/publish-streaming-submit-contract.mjs staging --dry-run
//
// Requires NODE_AUTH_TOKEN (or GITHUB_TOKEN) with write:packages on cultpodcasts/Api
// (not required for --dry-run).
// Workers Builds: set NODE_AUTH_TOKEN as a Build secret on api / api-preview.

import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const args = process.argv.slice(2).map((a) => a.trim());
const channel = (args.find((a) => !a.startsWith("-")) ?? "").toLowerCase();
const dryRun = args.includes("--dry-run");

if (channel !== "production" && channel !== "staging") {
	console.error(
		"Usage: node ./scripts/publish-streaming-submit-contract.mjs <production|staging> [--dry-run]"
	);
	process.exit(1);
}

const token = (process.env.NODE_AUTH_TOKEN || process.env.GITHUB_TOKEN || "").trim();
if (!dryRun && !token) {
	console.error("NODE_AUTH_TOKEN (or GITHUB_TOKEN) is required to publish to GitHub Packages.");
	process.exit(1);
}

const rootPkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const baseVersion = String(rootPkg.version || "").trim();
if (!/^\d+\.\d+\.\d+/.test(baseVersion)) {
	console.error(`Invalid root package.json version: ${baseVersion}`);
	process.exit(1);
}

const sha =
	(process.env.WORKERS_CI_COMMIT_SHA || process.env.GITHUB_SHA || "").trim() ||
	execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
const shortSha = sha.slice(0, 7);

const version =
	channel === "production" ? baseVersion : `${baseVersion}-staging.${shortSha}`;
const distTag = channel === "production" ? "latest" : "staging";

const fixtureTs = join(repoRoot, "tests/fixtures/streaming-submit-contract.ts");
const fixtureJson = join(repoRoot, "tests/fixtures/streaming-submit-contract.json");
const templatePkg = join(repoRoot, "packages/streaming-submit-contract/package.json");
const templateReadme = join(repoRoot, "packages/streaming-submit-contract/README.md");

const outDir = join(repoRoot, "packages/streaming-submit-contract/.publish");
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

copyFileSync(fixtureTs, join(outDir, "streaming-submit-contract.ts"));
copyFileSync(fixtureJson, join(outDir, "streaming-submit-contract.json"));
copyFileSync(templateReadme, join(outDir, "README.md"));

const pkg = JSON.parse(readFileSync(templatePkg, "utf8"));
pkg.version = version;
writeFileSync(join(outDir, "package.json"), `${JSON.stringify(pkg, null, "\t")}\n`);

writeFileSync(
	join(outDir, ".npmrc"),
	[
		"@cultpodcasts:registry=https://npm.pkg.github.com",
		"//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}",
		""
	].join("\n")
);

console.log(
	`Publishing @cultpodcasts/streaming-submit-contract@${version} (tag=${distTag}, channel=${channel})${dryRun ? " [dry-run]" : ""}`
);

if (dryRun) {
	console.log(`Assembled package at ${outDir}`);
	process.exit(0);
}

execSync(`npm publish --tag ${distTag} --access restricted`, {
	cwd: outDir,
	stdio: "inherit",
	env: {
		...process.env,
		NODE_AUTH_TOKEN: token
	}
});

console.log("Publish OK.");
