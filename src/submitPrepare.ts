import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { fetchHtmlWithBrowserRendering, isUsableBrowserHtml } from "./browserRenderingHtml";
import { buildFetchHeaders } from "./buildFetchHeaders";
import { Endpoint } from "./Endpoint";
import { getEndpoint } from "./endpoints";
import { LogCollector } from "./LogCollector";
import { fetchBcVideoApiJson } from "./bitchuteVideoPrepare";
import { htmlFetchModeForService, workerPrefetchesCatalogHtml, workerPrefetchesVideoJson } from "./streamingHtmlFetchMode";
import { fetchCatalogHtml } from "./catalogHtmlPrepare";
import {
	parseBrowserRenderingServicesCsv,
	putStreamMeta,
	type StreamMetaCacheEntry
} from "./submitPrepareMeta";
import {
	azureSubmitBackendDenialStatus,
	canCallAzureSubmitBackend
} from "./submitAccess";

type LookupBody = {
	known?: boolean;
	kind?: string;
	service?: string;
};

type AzurePrepareBody = {
	service: string;
	podcastName?: string | null;
	title?: string | null;
	description?: string;
	duration?: string | null;
	release?: string | null;
	image?: string | null;
	explicit?: boolean | null;
	publisher?: string | null;
	showName?: string | null;
};

function submitPath(env: Auth0ActionContext["env"], suffix: "prepare" | "extract"): URL {
	const base = getEndpoint(Endpoint.submit, env).toString().replace(/\/$/, "");
	return new URL(`${base}/${suffix}`);
}

function postAzureExtract(
	c: Auth0ActionContext,
	absoluteUrl: string,
	html: string
): Promise<Response> {
	const extractEndpoint = submitPath(c.env, "extract");
	return fetch(extractEndpoint, {
		method: "POST",
		headers: buildFetchHeaders(c.req, extractEndpoint),
		body: JSON.stringify({ url: absoluteUrl, html })
	});
}

/**
 * POST Azure extract for a Worker-prefetched body (JSON or HTML).
 * Non-200 falls through so the caller can Azure-prepare. Keep fetchers
 * (`fetchBcVideoApiJson` / `fetchCatalogHtml`) separate; grow this helper
 * for the next geo-walled host rather than copying the extract block.
 */
async function extractPrefetchedBody(
	c: Auth0ActionContext,
	absoluteUrl: string,
	body: string | null,
	addMessage: (message: string) => void,
	options: {
		statusLogPrefix: string;
		fallthroughMessage: string;
		onSuccess: () => void;
	}
): Promise<AzurePrepareBody | undefined> {
	if (!body) {
		return undefined;
	}
	const extractResp = await postAzureExtract(c, absoluteUrl, body);
	addMessage(`${options.statusLogPrefix} status=${extractResp.status}`);
	if (extractResp.status === 200) {
		const parsed = (await extractResp.json()) as AzurePrepareBody;
		options.onSuccess();
		return parsed;
	}
	addMessage(options.fallthroughMessage);
	return undefined;
}

export async function submitPrepare(c: Auth0ActionContext): Promise<Response> {
	const logCollector = new LogCollector();
	logCollector.collectRequest(c);
	logCollector.add({ route: "submit.prepare" });

	AddResponseHeaders(c, {
		omitCacheControlHeader: true,
		methods: ["POST", "OPTIONS"]
	});
	const auth0Payload = c.var.auth0("payload");
	if (!canCallAzureSubmitBackend(auth0Payload)) {
		const status = azureSubmitBackendDenialStatus(auth0Payload);
		logCollector.emitError({
			event: status === 401 ? "submit.prepare.unauthorised" : "submit.prepare.forbidden",
			outcome: status === 401 ? "unauthorised" : "forbidden",
			status
		});
		return c.json({ error: status === 401 ? "Unauthorised" : "Forbidden" }, status);
	}

	let body: { url?: string };
	try {
		body = await c.req.json();
	} catch {
		logCollector.emitError({
			event: "submit.prepare.invalid_json",
			outcome: "error",
			status: 400
		});
		return c.json({ error: "Invalid JSON body" }, 400);
	}

	let url: URL;
	try {
		if (!body.url?.trim()) {
			logCollector.emitError({
				event: "submit.prepare.missing_url",
				outcome: "error",
				status: 400
			});
			return c.json({ error: "Url must be an absolute http or https URL" }, 400);
		}
		url = new URL(body.url.trim());
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			logCollector.emitError({
				event: "submit.prepare.invalid_url",
				outcome: "error",
				status: 400
			});
			return c.json({ error: "Url must be an absolute http or https URL" }, 400);
		}
	} catch {
		logCollector.emitError({
			event: "submit.prepare.invalid_url",
			outcome: "error",
			status: 400
		});
		return c.json({ error: "Url must be an absolute http or https URL" }, 400);
	}

	const absoluteUrl = url.toString();
	logCollector.addMessage(`prepare url host=${url.host}`);

	const lookupUrl = getEndpoint(Endpoint.submit, c.env);
	lookupUrl.searchParams.set("url", absoluteUrl);
	const lookupResp = await fetch(lookupUrl, {
		method: "GET",
		headers: buildFetchHeaders(c.req, lookupUrl)
	});
	if (lookupResp.status !== 200) {
		logCollector.addMessage(`lookup status=${lookupResp.status}`);
		logCollector.emitError({
			event: "submit.prepare.lookup_failed",
			outcome: "error",
			status: 502
		});
		return c.json({ error: "Lookup failed during prepare" }, 502);
	}
	const lookup = (await lookupResp.json()) as LookupBody;
	if (lookup.kind !== "streaming" || !lookup.service) {
		logCollector.addMessage(`lookup kind=${lookup.kind ?? "none"} service=${lookup.service ?? "none"}`);
		logCollector.emitWarn({
			event: "submit.prepare.not_streaming",
			outcome: "error",
			status: 400
		});
		return c.json({ error: "Prepare is only supported for streaming URLs" }, 400);
	}

	const service = lookup.service;
	const allowlist = parseBrowserRenderingServicesCsv(c.env.browserRenderingServices);
	const mode = htmlFetchModeForService(service, allowlist);
	logCollector.addMessage(`service=${service} htmlFetchMode=${mode}`);

	let azureMeta: AzurePrepareBody | undefined;
	let bitchuteJsonExtractOk = false;
	let catalogHtmlExtractOk = false;
	const addPrepareMessage = (message: string) => logCollector.addMessage(message);
	if (workerPrefetchesVideoJson(service)) {
		const json = await fetchBcVideoApiJson(url, addPrepareMessage);
		azureMeta = await extractPrefetchedBody(c, absoluteUrl, json, addPrepareMessage, {
			statusLogPrefix: "bitchute azure extract",
			fallthroughMessage: "bitchute extract failed, falling back to azure prepare",
			onSuccess: () => {
				bitchuteJsonExtractOk = true;
			}
		});
	}

	if (!azureMeta && workerPrefetchesCatalogHtml(service)) {
		const html = await fetchCatalogHtml(url, addPrepareMessage);
		azureMeta = await extractPrefetchedBody(c, absoluteUrl, html, addPrepareMessage, {
			statusLogPrefix: "catalog html azure extract",
			fallthroughMessage: "catalog html extract failed, falling back to azure prepare",
			onSuccess: () => {
				catalogHtmlExtractOk = true;
			}
		});
	}

	if (!azureMeta && mode === "browserRendering") {
		if (!c.env.BROWSER) {
			logCollector.emitError({
				event: "submit.prepare.br_unconfigured",
				outcome: "error",
				status: 500
			});
			return c.json({ error: "Browser Rendering binding is not configured" }, 500);
		}
		let html: string;
		try {
			logCollector.add({ event: "submit.prepare.br_fetch" });
			const br = await fetchHtmlWithBrowserRendering(c.env.BROWSER, absoluteUrl);
			const d = br.diagnostics;
			logCollector.addMessage(
				`br marks=${d.marks.map((m) => `${m.label}:${m.tMs}`).join(",")}`
			);
			logCollector.addMessage(
				`br finalUrl=${d.finalUrl} title=${d.title ? "set" : "empty"} htmlLength=${d.htmlLength} documentStatus=${d.documentStatus ?? "none"} redirects=${d.redirectStatuses.join("|") || "none"} challengeLikely=${d.challengeLikely}`
			);
			if (d.gotoError) {
				logCollector.addMessage(`br gotoError=${d.gotoError}`);
			}
			html = br.html;
			if (!isUsableBrowserHtml(html)) {
				logCollector.addMessage(
					`br_failed: unusable html snippet=${html.slice(0, 240).replace(/\s+/g, " ")}`
				);
				logCollector.emitError({
					event: "submit.prepare.br_failed",
					outcome: "error",
					status: 502
				});
				return c.json({ error: "Browser Rendering fetch failed" }, 502);
			}
			if (d.gotoError) {
				logCollector.addMessage("br partial html usable — continuing to extract");
			} else {
				logCollector.addMessage(`br html length=${html.length}`);
			}
		} catch (e) {
			const detail = e instanceof Error ? e.message : String(e);
			logCollector.addMessage(`br_failed: ${detail}`);
			logCollector.emitError({
				event: "submit.prepare.br_failed",
				outcome: "error",
				status: 502
			});
			return c.json({ error: "Browser Rendering fetch failed" }, 502);
		}
		const extractResp = await postAzureExtract(c, absoluteUrl, html);
		logCollector.addMessage(`azure extract status=${extractResp.status}`);
		if (extractResp.status === 400) {
			logCollector.emitWarn({
				event: "submit.prepare.extract_client_error",
				outcome: "error",
				status: 400
			});
			return new Response(await extractResp.text(), {
				status: 400,
				headers: {
					"content-type": extractResp.headers.get("content-type") ?? "application/json"
				}
			});
		}
		if (extractResp.status !== 200) {
			logCollector.emitError({
				event: "submit.prepare.extract_failed",
				outcome: "error",
				status: 502
			});
			return c.json({ error: "Azure extract failed" }, 502);
		}
		azureMeta = (await extractResp.json()) as AzurePrepareBody;
	} else if (!azureMeta) {
		const prepareEndpoint = submitPath(c.env, "prepare");
		const prepareResp = await fetch(prepareEndpoint, {
			method: "POST",
			headers: buildFetchHeaders(c.req, prepareEndpoint),
			body: JSON.stringify({ url: absoluteUrl })
		});
		logCollector.addMessage(`azure prepare status=${prepareResp.status}`);
		if (prepareResp.status === 400) {
			logCollector.emitWarn({
				event: "submit.prepare.azure_client_error",
				outcome: "error",
				status: 400
			});
			return new Response(await prepareResp.text(), {
				status: 400,
				headers: {
					"content-type": prepareResp.headers.get("content-type") ?? "application/json"
				}
			});
		}
		if (prepareResp.status !== 200) {
			logCollector.emitError({
				event: "submit.prepare.azure_failed",
				outcome: "error",
				status: 502
			});
			return c.json({ error: "Azure prepare failed" }, 502);
		}
		azureMeta = (await prepareResp.json()) as AzurePrepareBody;
	}

	if (!azureMeta) {
		logCollector.emitError({
			event: "submit.prepare.azure_failed",
			outcome: "error",
			status: 502
		});
		return c.json({ error: "Azure prepare failed" }, 502);
	}

	const title = azureMeta.title ?? null;
	const podcastName = azureMeta.podcastName ?? null;
	logCollector.addMessage(
		`meta service=${azureMeta.service ?? service} podcastName=${podcastName ? "set" : "null"} title=${title ? "set" : "null"}`
	);

	const cacheEntry: StreamMetaCacheEntry = {
		service: azureMeta.service ?? service,
		podcastName,
		title: title ?? podcastName ?? "",
		description: azureMeta.description ?? "",
		duration: azureMeta.duration,
		release: azureMeta.release,
		image: azureMeta.image,
		explicit: azureMeta.explicit,
		publisher: azureMeta.publisher,
		showName: azureMeta.showName
	};
	try {
		await putStreamMeta(c.env.StreamMeta, absoluteUrl, cacheEntry);
		logCollector.addMessage("stream_meta kv put ok");
	} catch (e) {
		const detail = e instanceof Error ? e.message : String(e);
		logCollector.addMessage(`stream_meta kv put failed: ${detail}`);
		logCollector.emitError({
			event: "submit.prepare.kv_put_failed",
			outcome: "error",
			status: 500
		});
		return c.json({ error: "Failed to cache prepare meta" }, 500);
	}

	logCollector.emit({
		event: bitchuteJsonExtractOk
			? "submit.prepare.bitchute_json_ok"
			: catalogHtmlExtractOk
				? "submit.prepare.catalog_html_ok"
				: mode === "browserRendering"
					? "submit.prepare.br_ok"
					: "submit.prepare.direct_ok",
		outcome: "success",
		status: 200
	});
	return c.json({
		service,
		htmlFetchMode: mode,
		podcastName,
		title
	});
}
