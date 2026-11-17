#!/usr/bin/env node
/**
 * Keep ONE Terraform plan comment per PR (SP-1.10, cultpodcasts/Api#270).
 *
 * Finds the issue comment that carries {@link PLAN_MARKER} AND was written by the workflow
 * identity (`github-actions[bot]`), then edits exactly that comment, or creates one if none
 * exists. Unlike `gh pr comment --edit-last`, it never touches another bot comment, and a
 * human quoting the marker is ignored.
 *
 * Usage (in Actions): GH_TOKEN=… GITHUB_REPOSITORY=owner/repo node sticky-plan-comment.mjs <pr> <body.md> [marker]
 * One comment per marker: the production plan uses {@link PLAN_MARKER} (default), the preview
 * stack (SP-1.11, #273) passes {@link PREVIEW_PLAN_MARKER}, so the two plans never overwrite each other.
 * Exit 0 = edited or created, 1 = error.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const PLAN_MARKER = "<!-- terraform-search-d1-plan -->";
export const PREVIEW_PLAN_MARKER = "<!-- terraform-search-preview-plan -->";
/** Auth0 staging-tenant plan (auth0-stack.yml, cultpodcasts/Api#284). */
export const AUTH0_PREVIEW_PLAN_MARKER = "<!-- terraform-auth0-preview-plan -->";
export const WORKFLOW_AUTHOR = "github-actions[bot]";

/**
 * The plan comment to edit: the newest comment with the marker by the workflow identity.
 * @param {{ id: number, body?: string | null, user?: { login?: string } | null }[]} comments
 * @returns {number | undefined}
 */
export function findPlanCommentId(comments, marker = PLAN_MARKER, author = WORKFLOW_AUTHOR) {
	let found;
	for (const c of comments ?? []) {
		if (c?.user?.login === author && typeof c.body === "string" && c.body.includes(marker)) {
			found = c.id;
		}
	}
	return found;
}

async function api(token, method, path, body) {
	const res = await fetch(`https://api.github.com${path}`, {
		method,
		headers: {
			authorization: `Bearer ${token}`,
			accept: "application/vnd.github+json",
			"x-github-api-version": "2022-11-28",
			...(body ? { "content-type": "application/json" } : {})
		},
		body: body ? JSON.stringify(body) : undefined
	});
	if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`);
	return res.json();
}

async function main(argv) {
	const [pr, bodyFile, marker = PLAN_MARKER] = argv.slice(2);
	const token = process.env.GH_TOKEN;
	const repo = process.env.GITHUB_REPOSITORY;
	if (!pr || !bodyFile || !token || !repo) {
		console.error("usage: GH_TOKEN=… GITHUB_REPOSITORY=owner/repo sticky-plan-comment.mjs <pr> <body.md> [marker]");
		return 1;
	}
	const body = readFileSync(bodyFile, "utf8");
	if (!body.includes(marker)) {
		console.error(`::error::plan comment body must contain ${marker}`);
		return 1;
	}
	try {
		const comments = [];
		for (let page = 1; ; page++) {
			const batch = await api(token, "GET", `/repos/${repo}/issues/${pr}/comments?per_page=100&page=${page}`);
			comments.push(...batch);
			if (batch.length < 100) break;
		}
		const id = findPlanCommentId(comments, marker);
		if (id === undefined) {
			const created = await api(token, "POST", `/repos/${repo}/issues/${pr}/comments`, { body });
			console.log(`Created plan comment ${created.id}.`);
		} else {
			await api(token, "PATCH", `/repos/${repo}/issues/comments/${id}`, { body });
			console.log(`Updated plan comment ${id}.`);
		}
		return 0;
	} catch (e) {
		console.error(`::error::could not post the plan comment: ${e instanceof Error ? e.message : e}`);
		return 1;
	}
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	main(process.argv).then((code) => process.exit(code));
}
