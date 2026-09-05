import puppeteer, { type Browser } from "@cloudflare/puppeteer";
import fieldUrlsCatalog from "./field-urls.json";

type Env = { BROWSER: Fetcher };

export type FieldUrlTarget = {
	id: string;
	service: string;
	url: string;
	enabled?: boolean;
	notes?: string;
};

type NetEvent = {
	tMs: number;
	kind: "request" | "response" | "requestfailed";
	url: string;
	method?: string;
	status?: number;
	resourceType?: string;
	redirectFrom?: string;
	failure?: string;
};

type ProbeOptions = {
	waitUntil: "load" | "domcontentloaded" | "networkidle0" | "networkidle2";
	timeoutMs: number;
	hardCapMs: number;
	compact: boolean;
};

type ProbeResult = {
	id?: string;
	service?: string;
	source: "cloudflare-browser-run";
	url: string;
	finalUrl: string;
	waitUntil: string;
	timeoutMs: number;
	hardCapMs: number;
	elapsedMs: number;
	gotoError: string | null;
	title: string;
	htmlLength: number;
	htmlHasOgTitle: boolean;
	htmlHasNextData: boolean;
	htmlHasJsonLd: boolean;
	htmlHasTwitterTitle: boolean;
	challengeLikely: boolean;
	usable: boolean;
	marks: { label: string; tMs: number }[];
	documentStatus: number | null;
	redirectStatuses: number[];
	fatal?: string;
	htmlSnippet?: string;
	html?: string;
	screenshotPngBase64?: string | null;
	documentResponses?: NetEvent[];
	redirectResponses?: NetEvent[];
	netSample?: NetEvent[];
};

function catalogTargets(): FieldUrlTarget[] {
	return (fieldUrlsCatalog as { targets: FieldUrlTarget[] }).targets ?? [];
}

/** Enabled targets with a non-empty http(s) URL from field-urls.json (and optional filters). */
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

function usableFromHtml(html: string): {
	htmlHasOgTitle: boolean;
	htmlHasNextData: boolean;
	htmlHasJsonLd: boolean;
	htmlHasTwitterTitle: boolean;
	challengeLikely: boolean;
	usable: boolean;
} {
	const sample = html.slice(0, 8000);
	const challengeLikely =
		/just a moment/i.test(sample) ||
		/cf-browser-verification/i.test(sample) ||
		/challenge-platform/i.test(sample) ||
		/Enable JavaScript and cookies/i.test(sample) ||
		/Attention Required/i.test(sample) ||
		/checking your browser/i.test(sample) ||
		/bot.?detect/i.test(sample);
	const htmlHasOgTitle =
		/property\s*=\s*["']og:title["']/i.test(html) || /name\s*=\s*["']og:title["']/i.test(html);
	const htmlHasNextData = html.includes("__NEXT_DATA__");
	const htmlHasJsonLd = /type\s*=\s*["']application\/ld\+json["']/i.test(html);
	const htmlHasTwitterTitle =
		/name\s*=\s*["']twitter:title["']/i.test(html) ||
		/property\s*=\s*["']twitter:title["']/i.test(html);
	const minLength = html.length >= 500;
	const usable =
		minLength &&
		!challengeLikely &&
		(htmlHasOgTitle || htmlHasNextData || htmlHasJsonLd || htmlHasTwitterTitle);
	return {
		htmlHasOgTitle,
		htmlHasNextData,
		htmlHasJsonLd,
		htmlHasTwitterTitle,
		challengeLikely,
		usable
	};
}

async function probeOneUrl(
	browser: Browser,
	target: FieldUrlTarget,
	opts: ProbeOptions
): Promise<ProbeResult> {
	const pageUrl = target.url.trim();
	const started = Date.now();
	const t0 = Date.now();
	const mark = (label: string) => ({ label, tMs: Date.now() - t0 });
	const marks: { label: string; tMs: number }[] = [mark("start")];
	const net: NetEvent[] = [];

	const page = await browser.newPage();
	try {
		await page.setViewport({ width: 1280, height: 720 });
		await page.setUserAgent(
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
		);

		page.on("request", (req) => {
			if (net.length > 80) return;
			net.push({
				tMs: Date.now() - t0,
				kind: "request",
				url: req.url().slice(0, 300),
				method: req.method(),
				resourceType: req.resourceType(),
				redirectFrom: req.redirectChain?.()?.[0]?.url()?.slice(0, 200)
			});
		});
		page.on("response", (res) => {
			if (net.length > 80) return;
			const req = res.request();
			net.push({
				tMs: Date.now() - t0,
				kind: "response",
				url: res.url().slice(0, 300),
				status: res.status(),
				resourceType: req.resourceType(),
				method: req.method()
			});
		});
		page.on("requestfailed", (req) => {
			if (net.length > 80) return;
			net.push({
				tMs: Date.now() - t0,
				kind: "requestfailed",
				url: req.url().slice(0, 300),
				resourceType: req.resourceType(),
				failure: req.failure()?.errorText
			});
		});

		let gotoError: string | null = null;
		const gotoPromise = (async () => {
			try {
				await page.goto(pageUrl, { waitUntil: opts.waitUntil, timeout: opts.timeoutMs });
				marks.push(mark("goto_ok"));
			} catch (e) {
				gotoError = e instanceof Error ? e.message : String(e);
				marks.push(mark("goto_error"));
			}
		})();

		await Promise.race([
			gotoPromise,
			new Promise<void>((resolve) =>
				setTimeout(() => {
					if (!gotoError) {
						gotoError = `hardCap ${opts.hardCapMs}ms exceeded during goto`;
						marks.push(mark("hard_cap"));
					}
					resolve();
				}, opts.hardCapMs)
			)
		]);

		const title = await page.title().catch(() => "");
		marks.push(mark("title"));
		const html = await page.content().catch(() => "");
		marks.push(mark("content"));
		const finalUrl = page.url();
		const signals = usableFromHtml(html);

		let screenshotBase64: string | null = null;
		if (!opts.compact) {
			try {
				const buf = await page.screenshot({ type: "png", fullPage: false });
				screenshotBase64 = Buffer.from(buf).toString("base64");
				marks.push(mark("screenshot"));
			} catch {
				marks.push(mark("screenshot_error"));
			}
		}

		const docResponses = net.filter(
			(e) =>
				e.kind === "response" &&
				(e.resourceType === "document" || e.url.startsWith(pageUrl.slice(0, 40)))
		);
		const redirects = net.filter(
			(e) => e.kind === "response" && e.status !== undefined && e.status >= 300 && e.status < 400
		);

		return {
			id: target.id,
			service: target.service,
			source: "cloudflare-browser-run",
			url: pageUrl,
			finalUrl,
			waitUntil: opts.waitUntil,
			timeoutMs: opts.timeoutMs,
			hardCapMs: opts.hardCapMs,
			elapsedMs: Date.now() - started,
			gotoError,
			title,
			htmlLength: html.length,
			...signals,
			marks,
			documentStatus: docResponses[0]?.status ?? null,
			redirectStatuses: redirects
				.map((e) => e.status)
				.filter((s): s is number => typeof s === "number")
				.slice(0, 20),
			...(opts.compact
				? { htmlSnippet: html.slice(0, 400) }
				: {
						documentResponses: docResponses.slice(0, 20),
						redirectResponses: redirects.slice(0, 20),
						netSample: net.slice(0, 40),
						htmlSnippet: html.slice(0, 1500),
						html,
						screenshotPngBase64: screenshotBase64
					})
		};
	} finally {
		try {
			await page.close();
		} catch {
			/* ignore */
		}
	}
}

function parseOpts(q: URLSearchParams): ProbeOptions {
	return {
		waitUntil:
			(q.get("waitUntil") as ProbeOptions["waitUntil"] | null) ?? "domcontentloaded",
		timeoutMs: Number(q.get("timeoutMs") ?? "15000"),
		hardCapMs: Number(q.get("hardCapMs") ?? "40000"),
		compact: q.get("compact") === "1" || q.get("compact") === "true"
	};
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const q = url.searchParams;
		const opts = parseOpts(q);

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

		let browser: Browser | null = null;
		const batchStarted = Date.now();
		try {
			browser = await puppeteer.launch(env.BROWSER);
			const results: ProbeResult[] = [];
			for (const t of targets) {
				try {
					results.push(await probeOneUrl(browser, t, opts));
				} catch (e) {
					results.push({
						id: t.id,
						service: t.service,
						source: "cloudflare-browser-run",
						url: t.url,
						finalUrl: t.url,
						waitUntil: opts.waitUntil,
						timeoutMs: opts.timeoutMs,
						hardCapMs: opts.hardCapMs,
						elapsedMs: 0,
						gotoError: null,
						title: "",
						htmlLength: 0,
						htmlHasOgTitle: false,
						htmlHasNextData: false,
						htmlHasJsonLd: false,
						htmlHasTwitterTitle: false,
						challengeLikely: false,
						usable: false,
						marks: [],
						documentStatus: null,
						redirectStatuses: [],
						fatal: e instanceof Error ? e.message : String(e)
					});
				}
			}

			const passed = results.filter((r) => r.usable && !r.fatal && !r.gotoError).length;
			const failed = results.length - passed;
			const payload = {
				source: "cloudflare-browser-run-batch",
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
					{ status: only.usable && !only.fatal && !only.gotoError ? 200 : 502 }
				);
			}

			return Response.json(payload, { status: payload.ok ? 200 : 502 });
		} catch (e) {
			return Response.json(
				{
					source: "cloudflare-browser-run-batch",
					fatal: e instanceof Error ? e.message : String(e),
					elapsedMs: Date.now() - batchStarted
				},
				{ status: 500 }
			);
		} finally {
			if (browser) {
				try {
					await browser.close();
				} catch {
					/* ignore */
				}
			}
		}
	}
};
