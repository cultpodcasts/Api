import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { fetchHtmlWithBrowserRendering } from "./browserRenderingHtml";
import { buildFetchHeaders } from "./buildFetchHeaders";
import { Endpoint } from "./Endpoint";
import { getEndpoint } from "./endpoints";
import { htmlFetchModeForService } from "./streamingHtmlFetchMode";
import {
	parseBrowserRenderingServicesCsv,
	putStreamMeta,
	type StreamMetaCacheEntry
} from "./submitPrepareMeta";
import {
	azureSubmitBackendDenialStatus,
	azureSubmitProxyPermission,
	canCallAzureSubmitBackend
} from "./submitAccess";
import { hasPermission } from "./hasPermission";

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

export async function submitPrepare(c: Auth0ActionContext): Promise<Response> {
	AddResponseHeaders(c, {
		omitCacheControlHeader: true,
		methods: ["POST", "OPTIONS"]
	});
	const auth0Payload = c.var.auth0("payload");
	if (!canCallAzureSubmitBackend(auth0Payload)) {
		const status = azureSubmitBackendDenialStatus(auth0Payload);
		return c.json({ error: status === 401 ? "Unauthorised" : "Forbidden" }, status);
	}

	let body: { url?: string };
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}

	let url: URL;
	try {
		if (!body.url?.trim()) {
			return c.json({ error: "Url must be an absolute http or https URL" }, 400);
		}
		url = new URL(body.url.trim());
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			return c.json({ error: "Url must be an absolute http or https URL" }, 400);
		}
	} catch {
		return c.json({ error: "Url must be an absolute http or https URL" }, 400);
	}

	const absoluteUrl = url.toString();
	const permission = azureSubmitProxyPermission(auth0Payload);
	if (!hasPermission(auth0Payload, permission)) {
		return c.json({ error: "Forbidden" }, 403);
	}

	const lookupUrl = getEndpoint(Endpoint.submit, c.env);
	lookupUrl.searchParams.set("url", absoluteUrl);
	const lookupResp = await fetch(lookupUrl, {
		method: "GET",
		headers: buildFetchHeaders(c.req, lookupUrl)
	});
	if (lookupResp.status !== 200) {
		return c.json({ error: "Lookup failed during prepare" }, 502);
	}
	const lookup = (await lookupResp.json()) as LookupBody;
	if (lookup.kind !== "streaming" || !lookup.service) {
		return c.json({ error: "Prepare is only supported for streaming URLs" }, 400);
	}

	const service = lookup.service;
	const allowlist = parseBrowserRenderingServicesCsv(c.env.browserRenderingServices);
	const mode = htmlFetchModeForService(service, allowlist);

	let azureMeta: AzurePrepareBody;
	if (mode === "browserRendering") {
		if (!c.env.BROWSER) {
			return c.json({ error: "Browser Rendering binding is not configured" }, 500);
		}
		let html: string;
		try {
			html = await fetchHtmlWithBrowserRendering(c.env.BROWSER, absoluteUrl);
		} catch (e) {
			console.error("submit.prepare.br_failed", e);
			return c.json({ error: "Browser Rendering fetch failed" }, 502);
		}
		const extractEndpoint = submitPath(c.env, "extract");
		const extractResp = await fetch(extractEndpoint, {
			method: "POST",
			headers: buildFetchHeaders(c.req, extractEndpoint),
			body: JSON.stringify({ url: absoluteUrl, html })
		});
		if (extractResp.status === 400) {
			return new Response(await extractResp.text(), {
				status: 400,
				headers: {
					"content-type": extractResp.headers.get("content-type") ?? "application/json"
				}
			});
		}
		if (extractResp.status !== 200) {
			return c.json({ error: "Azure extract failed" }, 502);
		}
		azureMeta = (await extractResp.json()) as AzurePrepareBody;
	} else {
		const prepareEndpoint = submitPath(c.env, "prepare");
		const prepareResp = await fetch(prepareEndpoint, {
			method: "POST",
			headers: buildFetchHeaders(c.req, prepareEndpoint),
			body: JSON.stringify({ url: absoluteUrl })
		});
		if (prepareResp.status === 400) {
			return new Response(await prepareResp.text(), {
				status: 400,
				headers: {
					"content-type": prepareResp.headers.get("content-type") ?? "application/json"
				}
			});
		}
		if (prepareResp.status !== 200) {
			return c.json({ error: "Azure prepare failed" }, 502);
		}
		azureMeta = (await prepareResp.json()) as AzurePrepareBody;
	}

	const title = azureMeta.title ?? null;
	const podcastName = azureMeta.podcastName ?? null;

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
	await putStreamMeta(c.env.StreamMeta, absoluteUrl, cacheEntry);

	return c.json({
		service,
		htmlFetchMode: mode,
		podcastName,
		title
	});
}
