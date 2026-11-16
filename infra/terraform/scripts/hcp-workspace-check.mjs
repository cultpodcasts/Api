#!/usr/bin/env node
/**
 * HCP Terraform workspace pre-flight (SP-1.10, cultpodcasts/Api#270).
 *
 * The plan guard needs a local saved plan, which only works when the HCP workspace uses
 * Execution Mode: Local. If the workspace is missing, `terraform init` would create it with
 * the organisation's default mode (usually Remote), and `plan -out` then fails with a cryptic
 * "Saving a generated plan is currently not supported". This check runs before `init` and
 * fails with a clear message instead.
 *
 * The organisation and workspace are read from the `cloud {}` block in versions.tf, so the
 * organisation is a single value in one place.
 *
 * Usage: TF_TOKEN_app_terraform_io=… node hcp-workspace-check.mjs [path/to/versions.tf]
 * Exit 0 = workspace exists and is Local, 1 = not usable, 2 = could not check.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const DEFAULT_VERSIONS_TF = "infra/terraform/search/production/versions.tf";
export const HCP_API = "https://app.terraform.io/api/v2";

/** `{ organization, workspace }` from the `cloud {}` block of a Terraform file. */
export function readCloudBlock(text) {
	const cloud = /cloud\s*\{([\s\S]*?)\n\s*\}\s*\n/.exec(text)?.[1] ?? "";
	const organization = /organization\s*=\s*"([^"]+)"/.exec(cloud)?.[1];
	const workspace = /workspaces\s*\{[^}]*?name\s*=\s*"([^"]+)"/.exec(cloud)?.[1];
	if (!organization || !workspace) {
		throw new Error("no cloud { organization = \"…\" workspaces { name = \"…\" } } block found");
	}
	return { organization, workspace };
}

/**
 * Decide from the HCP API answer (`GET /organizations/:org/workspaces/:name`).
 * @returns {{ ok: boolean, message: string }}
 */
export function evaluateWorkspace({ organization, workspace }, status, body) {
	const where = `${organization}/${workspace}`;
	if (status === 404) {
		return {
			ok: false,
			message:
				`HCP workspace ${where} not found, or the token cannot see it. Create it (CLI-driven, Execution Mode: Local) ` +
				"and give the TF_TOKEN_APP_TERRAFORM_IO team access. See infra/terraform/README.md."
		};
	}
	if (status === 401 || status === 403) {
		return { ok: false, message: `HCP token rejected (${status}) for ${where}. Check TF_TOKEN_APP_TERRAFORM_IO.` };
	}
	if (status !== 200) {
		return { ok: false, message: `HCP API returned ${status} for ${where}.` };
	}
	const mode = body?.data?.attributes?.["execution-mode"];
	if (mode !== "local") {
		return {
			ok: false,
			message:
				`HCP workspace ${where} has Execution Mode "${mode ?? "unknown"}", must be "local": plans run on the runner ` +
				"so the plan guard can read the saved plan. Change it under Workspace → Settings → General."
		};
	}
	return { ok: true, message: `HCP workspace ${where} exists with Execution Mode: Local.` };
}

async function main(argv) {
	const file = argv[2] ?? DEFAULT_VERSIONS_TF;
	const token = process.env.TF_TOKEN_app_terraform_io;
	if (!token) {
		console.error("::error::TF_TOKEN_app_terraform_io is not set.");
		return 2;
	}
	let target;
	try {
		target = readCloudBlock(readFileSync(file, "utf8"));
	} catch (e) {
		console.error(`::error::${file}: ${e instanceof Error ? e.message : e}`);
		return 2;
	}
	let status;
	let body;
	try {
		const url = `${HCP_API}/organizations/${encodeURIComponent(target.organization)}/workspaces/${encodeURIComponent(target.workspace)}`;
		const res = await fetch(url, {
			headers: { authorization: `Bearer ${token}`, "content-type": "application/vnd.api+json" }
		});
		status = res.status;
		body = status === 200 ? await res.json() : undefined;
	} catch (e) {
		console.error(`::error::could not reach HCP Terraform: ${e instanceof Error ? e.message : e}`);
		return 2;
	}
	const result = evaluateWorkspace(target, status, body);
	if (!result.ok) {
		console.error(`::error title=HCP workspace::${result.message}`);
		return 1;
	}
	console.log(result.message);
	return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	main(process.argv).then((code) => process.exit(code));
}
