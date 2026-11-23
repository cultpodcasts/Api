import type { ApiEnvironment } from "../apiEnvironment";

/**
 * Shared header chrome for the admin docs pages (`/docs` and `/docs/search-shadow-soak`, Api #310):
 * the non-production environment banner, the top-right actions (always ending in Logout) and
 * a title with a Swagger-style version badge. Each page adds its own extras (the docs page's token
 * hamburger, the soak page's link back to the docs).
 */

export type DocsEnvironmentLabels = {
	isNonProd: boolean;
	bannerLabel: string;
	bannerText: string;
	/** Appended to each page's `<title>`: "", " (Preview)" or " (Local)". */
	titleSuffix: string;
};

export function docsEnvironmentLabels(environment: ApiEnvironment): DocsEnvironmentLabels {
	switch (environment) {
		case "preview":
			return { isNonProd: true, bannerLabel: "PREVIEW", bannerText: "Staging Worker — not production", titleSuffix: " (Preview)" };
		case "local":
			return { isNonProd: true, bannerLabel: "LOCAL", bannerText: "Local Wrangler — not production", titleSuffix: " (Local)" };
		default:
			return { isNonProd: false, bannerLabel: "", bannerText: "", titleSuffix: "" };
	}
}

function esc(value: string): string {
	return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

/**
 * CSS for the banner, the top actions, the Logout-style buttons and the title + version badge. The
 * actions are a normal row at the top of the page (Api #312): they scroll away with it and never
 * float over the content.
 */
export function docsChromeStyles(environment: ApiEnvironment): string {
	const { isNonProd } = docsEnvironmentLabels(environment);
	return `
			.env-banner {
				display: ${isNonProd ? "flex" : "none"};
				align-items: center;
				gap: 10px;
				padding: 8px 16px;
				background: #92400e;
				color: #fffbeb;
				font: 600 13px/1.3 system-ui, sans-serif;
				border-bottom: 1px solid #78350f;
			}
			.env-banner .env-pill {
				display: inline-block;
				padding: 2px 8px;
				border-radius: 999px;
				background: #fbbf24;
				color: #78350f;
				font: 700 11px/1.4 system-ui, sans-serif;
				letter-spacing: 0.04em;
			}
			.top-actions {
				display: flex;
				flex-wrap: wrap;
				justify-content: flex-end;
				gap: 8px;
				align-items: center;
				padding: 12px 16px 0;
			}
			.logout {
				display: inline-flex;
				align-items: center;
				background: #111827;
				color: #ffffff;
				padding: 8px 12px;
				border-radius: 6px;
				text-decoration: none;
				font: 600 13px system-ui, sans-serif;
			}
			.docs-title {
				margin: 0 0 8px;
				color: #3b4151;
				font: 700 36px/1.2 sans-serif;
			}
			.docs-version {
				display: inline-block;
				margin-left: 6px;
				padding: 2px 6px;
				border-radius: 57px;
				background: #7d8492;
				color: #ffffff;
				font: 700 10px/1.4 sans-serif;
				vertical-align: super;
			}`;
}

/** The environment banner (empty in production). */
export function docsEnvBanner(environment: ApiEnvironment): string {
	const { isNonProd, bannerLabel, bannerText } = docsEnvironmentLabels(environment);
	return isNonProd ? `<div class="env-banner" role="status"><span class="env-pill">${bannerLabel}</span><span>${bannerText}</span></div>` : "";
}

export type DocsAction = { href: string; label: string };

/** Fixed top-right actions: optional leading markup (the docs hamburger), the links, then Logout. */
export function docsTopActions(opts: { leading?: string; links?: DocsAction[] } = {}): string {
	const links = (opts.links ?? []).map((l) => `<a class="logout" href="${esc(l.href)}">${esc(l.label)}</a>`).join("\n\t\t\t");
	return `<div class="top-actions">
			${opts.leading ?? ""}
			${links}
			<a class="logout" href="/docs/logout">Logout</a>
		</div>`;
}

/** Page title with the Swagger-style version badge. */
export function docsTitle(title: string, version: string): string {
	return `<h1 class="docs-title">${esc(title)}<span class="docs-version">${esc(version)}</span></h1>`;
}
