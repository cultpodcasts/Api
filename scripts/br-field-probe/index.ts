/**
 * On-demand BR field probe — **must** call the same module as prepare.
 * Do not reimplement Puppeteer goto/UA/settle here; that drifts from production
 * and makes a green probe meaningless for Api Worker prepare failures.
 */
import type { BrowserWorker } from "@cloudflare/puppeteer";
import {
	fetchHtmlWithBrowserRendering,
	HARD_CAP_MS,
	isUsableBrowserHtml
} from "../../src/browserRenderingHtml";
import fieldUrlsCatalog from "./field-urls.json";

type Env = { BROWSER: BrowserWorker };

export type FieldUrlTarget = {
	id: string;
	service: string;
	url: string;
	enabled?: boolean;
	notes?: string;
};

type ProbeResult = {
	id: string;
	service: string;
	/** Always the production prepare BR helper. */
	source: "api-browserRenderingHtml";
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

async function probeOneUrl(env: Env, target: FieldUrlTarget, compact: boolean): Promise<ProbeResult> {
	const pageUrl = target.url.trim();
	const started = Date.now();
	try {
		const br = await fetchHtmlWithBrowserRendering(env.BROWSER, pageUrl);
		const d = br.diagnostics;
		const html = br.html;
		const usable = isUsableBrowserHtml(html);
		return {
			id: target.id,
			service: target.service,
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
			usable: false,
			marks: [],
			documentStatus: null,
			redirectStatuses: [],
			fatal: e instanceof Error ? e.message : String(e)
		};
	}
}

function pass(r: ProbeResult): boolean {
	return r.usable && !r.fatal && !r.gotoError;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const q = url.searchParams;
		const compact = q.get("compact") === "1" || q.get("compact") === "true";

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
			results.push(await probeOneUrl(env, t, compact));
		}

		const passed = results.filter(pass).length;
		const failed = results.length - passed;
		const payload = {
			source: "api-browserRenderingHtml-batch",
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
