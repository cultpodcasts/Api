/**
 * On-demand scrape field probe — **must** call the same modules as prepare.
 * Modes: `br` (default) → browserRenderingHtml; `fetch` → catalogHtmlPrepare.
 * Do not reimplement Puppeteer goto/UA/settle or catalogue GET headers here.
 */
import type { BrowserWorker } from "@cloudflare/puppeteer";
import {
	fetchHtmlWithBrowserRendering,
	HARD_CAP_MS,
	isUsableBrowserHtml
} from "../../src/browserRenderingHtml";
import {
	fetchCatalogHtml,
	titleFromCatalogHtml
} from "../../src/catalogHtmlPrepare";
import { isMarketingShellHtml } from "../../src/marketingShellReject";
import { verifyAuth0M2mBearer } from "../../src/verifyAuth0M2mBearer";
import fieldUrlsCatalog from "./field-urls.json";

type Env = {
	BROWSER: BrowserWorker;
	/** Same Auth0 API issuer as top-level api Worker (trailing slash normalized). */
	auth0Issuer: string;
	/** Same Auth0 API audience as top-level api Worker. */
	auth0Audience: string;
};

export type FieldUrlTarget = {
	id: string;
	service: string;
	url: string;
	enabled?: boolean;
	notes?: string;
};

type ProbeMode = "br" | "fetch";

type ProbeResult = {
	id: string;
	service: string;
	mode: ProbeMode;
	/** Production helper used for this leg. */
	source: "api-browserRenderingHtml" | "api-catalogHtmlPrepare";
	url: string;
	finalUrl: string;
	hardCapMs: number;
	elapsedMs: number;
	gotoError: string | null;
	title: string;
	htmlLength: number;
	htmlHasOgTitle: boolean;
	htmlHasNextData: boolean;
	challengeLikely: boolean;
	marketingShell: boolean;
	usable: boolean;
	marks: { label: string; tMs: number }[];
	documentStatus: number | null;
	redirectStatuses: number[];
	fatal?: string;
	htmlSnippet?: string;
};

function catalogTargets(): FieldUrlTarget[] {
	return (fieldUrlsCatalog as { targets: FieldUrlTarget[] }).targets ?? [];
}

export function resolveTargetsFromCatalog(opts?: {
	service?: string | null;
	id?: string | null;
}): FieldUrlTarget[] {
	const service = opts?.service?.trim();
	const id = opts?.id?.trim();
	return catalogTargets().filter((t) => {
		if (t.enabled === false) {
			return false;
		}
		if (!t.url?.trim()) {
			return false;
		}
		try {
			const u = new URL(t.url.trim());
			if (u.protocol !== "http:" && u.protocol !== "https:") {
				return false;
			}
		} catch {
			return false;
		}
		if (service && t.service !== service) {
			return false;
		}
		if (id && t.id !== id) {
			return false;
		}
		return true;
	});
}

function parseTargetsBody(body: unknown): FieldUrlTarget[] | null {
	if (!body || typeof body !== "object") {
		return null;
	}
	const o = body as Record<string, unknown>;
	if (Array.isArray(o.targets)) {
		return o.targets as FieldUrlTarget[];
	}
	if (Array.isArray(o.urls)) {
		return (o.urls as unknown[]).map((item, i) => {
			if (typeof item === "string") {
				return { id: `url-${i + 1}`, service: "unknown", url: item, enabled: true };
			}
			return item as FieldUrlTarget;
		});
	}
	return null;
}

function htmlSignals(html: string) {
	return {
		htmlHasOgTitle: /property\s*=\s*["']og:title["']/i.test(html),
		htmlHasNextData: html.includes("__NEXT_DATA__"),
		challengeLikely: /cf-browser-verification|just a moment|attention required/i.test(html)
	};
}

async function probeFetch(target: FieldUrlTarget, compact: boolean): Promise<ProbeResult> {
	const pageUrl = target.url.trim();
	const started = Date.now();
	const messages: string[] = [];
	try {
		const fetched = await fetchCatalogHtml(new URL(pageUrl), (m) => messages.push(m));
		if (!fetched) {
			return {
				id: target.id,
				service: target.service,
				mode: "fetch",
				source: "api-catalogHtmlPrepare",
				url: pageUrl,
				finalUrl: pageUrl,
				hardCapMs: 0,
				elapsedMs: Date.now() - started,
				gotoError: null,
				title: "",
				htmlLength: 0,
				htmlHasOgTitle: false,
				htmlHasNextData: false,
				challengeLikely: messages.some((m) => m.includes("challenge")),
				marketingShell: false,
				usable: false,
				marks: [],
				documentStatus: null,
				redirectStatuses: [],
				fatal: messages.join("; ") || "catalog html miss"
			};
		}
		const { html, finalUrl } = fetched;
		const title = titleFromCatalogHtml(html);
		const signals = htmlSignals(html);
		const marketingShell = isMarketingShellHtml({
			service: target.service,
			submittedUrl: pageUrl,
			finalUrl,
			title,
			html
		});
		const usable =
			!marketingShell &&
			html.length >= 500 &&
			(signals.htmlHasOgTitle || signals.htmlHasNextData || title.length > 0);
		return {
			id: target.id,
			service: target.service,
			mode: "fetch",
			source: "api-catalogHtmlPrepare",
			url: pageUrl,
			finalUrl,
			hardCapMs: 0,
			elapsedMs: Date.now() - started,
			gotoError: null,
			title,
			htmlLength: html.length,
			...signals,
			marketingShell,
			usable,
			marks: [],
			documentStatus: null,
			redirectStatuses: [],
			htmlSnippet: html.slice(0, compact ? 400 : 1500)
		};
	} catch (e) {
		return {
			id: target.id,
			service: target.service,
			mode: "fetch",
			source: "api-catalogHtmlPrepare",
			url: pageUrl,
			finalUrl: pageUrl,
			hardCapMs: 0,
			elapsedMs: Date.now() - started,
			gotoError: null,
			title: "",
			htmlLength: 0,
			htmlHasOgTitle: false,
			htmlHasNextData: false,
			challengeLikely: false,
			marketingShell: false,
			usable: false,
			marks: [],
			documentStatus: null,
			redirectStatuses: [],
			fatal: e instanceof Error ? e.message : String(e)
		};
	}
}

async function probeBr(
	env: Env,
	target: FieldUrlTarget,
	compact: boolean
): Promise<ProbeResult> {
	const pageUrl = target.url.trim();
	const started = Date.now();
	try {
		const br = await fetchHtmlWithBrowserRendering(env.BROWSER, pageUrl);
		const d = br.diagnostics;
		const html = br.html;
		const marketingShell = isMarketingShellHtml({
			service: target.service,
			submittedUrl: pageUrl,
			finalUrl: d.finalUrl,
			title: d.title,
			html
		});
		const usable = isUsableBrowserHtml(html) && !marketingShell;
		return {
			id: target.id,
			service: target.service,
			mode: "br",
			source: "api-browserRenderingHtml",
			url: pageUrl,
			finalUrl: d.finalUrl,
			hardCapMs: HARD_CAP_MS,
			elapsedMs: Date.now() - started,
			gotoError: d.gotoError ?? null,
			title: d.title,
			htmlLength: d.htmlLength,
			htmlHasOgTitle: /property\s*=\s*["']og:title["']/i.test(html),
			htmlHasNextData: html.includes("__NEXT_DATA__"),
			challengeLikely: d.challengeLikely,
			marketingShell,
			usable,
			marks: d.marks,
			documentStatus: d.documentStatus ?? null,
			redirectStatuses: d.redirectStatuses,
			htmlSnippet: html.slice(0, compact ? 400 : 1500)
		};
	} catch (e) {
		return {
			id: target.id,
			service: target.service,
			mode: "br",
			source: "api-browserRenderingHtml",
			url: pageUrl,
			finalUrl: pageUrl,
			hardCapMs: HARD_CAP_MS,
			elapsedMs: Date.now() - started,
			gotoError: null,
			title: "",
			htmlLength: 0,
			htmlHasOgTitle: false,
			htmlHasNextData: false,
			challengeLikely: false,
			marketingShell: false,
			usable: false,
			marks: [],
			documentStatus: null,
			redirectStatuses: [],
			fatal: e instanceof Error ? e.message : String(e)
		};
	}
}

function pass(r: ProbeResult): boolean {
	return r.usable && !r.fatal && !r.gotoError && !r.marketingShell;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const auth = await verifyAuth0M2mBearer(
			request.headers.get("Authorization"),
			env.auth0Issuer,
			env.auth0Audience
		);
		if (!auth.ok) {
			return Response.json({ error: auth.error }, { status: auth.status });
		}

		const url = new URL(request.url);
		const q = url.searchParams;
		const compact = q.get("compact") === "1" || q.get("compact") === "true";
		const modeParam = (q.get("mode") || "br").toLowerCase();
		const mode: ProbeMode = modeParam === "fetch" ? "fetch" : "br";

		let targets: FieldUrlTarget[] = [];

		if (request.method === "POST") {
			let body: unknown = null;
			try {
				body = await request.json();
			} catch {
				body = null;
			}
			const fromBody = parseTargetsBody(body);
			if (fromBody && fromBody.length > 0) {
				targets = fromBody.filter((t) => t.enabled !== false && t.url?.trim());
			} else {
				targets = resolveTargetsFromCatalog({
					service: q.get("service"),
					id: q.get("id")
				});
			}
		} else if (q.get("url")?.trim()) {
			targets = [
				{
					id: q.get("id")?.trim() || "adhoc",
					service: q.get("service")?.trim() || "unknown",
					url: q.get("url")!.trim(),
					enabled: true
				}
			];
		} else {
			targets = resolveTargetsFromCatalog({
				service: q.get("service"),
				id: q.get("id")
			});
		}

		if (targets.length === 0) {
			return Response.json(
				{
					error: "No targets",
					hint: "Enable entries with real urls in field-urls.json, POST { targets: [...] }, or pass ?url="
				},
				{ status: 400 }
			);
		}

		const batchStarted = Date.now();
		const results: ProbeResult[] = [];
		for (const t of targets) {
			results.push(
				mode === "fetch" ? await probeFetch(t, compact) : await probeBr(env, t, compact)
			);
		}

		const passed = results.filter(pass).length;
		const failed = results.length - passed;
		const payload = {
			mode,
			source:
				mode === "fetch"
					? "api-catalogHtmlPrepare-batch"
					: "api-browserRenderingHtml-batch",
			usesProductionHelper: true as const,
			elapsedMs: Date.now() - batchStarted,
			count: results.length,
			passed,
			failed,
			ok: failed === 0,
			results
		};

		if (targets.length === 1) {
			const only = results[0]!;
			return Response.json(
				{ ...only, batch: payload },
				{ status: pass(only) ? 200 : 502 }
			);
		}

		return Response.json(payload, { status: payload.ok ? 200 : 502 });
	}
};
