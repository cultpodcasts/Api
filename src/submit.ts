import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient, Prisma } from "@prisma/client";
import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { LogCollector } from "./LogCollector";
import { proxyToAzure } from "./proxyToAzure";
import {
	azureSubmitProxyPermission,
	canCallAzureSubmitBackend
} from "./submitAccess";
import { getStreamMeta, toPrefetchedMeta } from "./submitPrepareMeta";

export async function submit(c: Auth0ActionContext): Promise<Response> {
	const auth0Payload: Auth0JwtPayload = c.var.auth0("payload");
	const logCollector = new LogCollector();
	logCollector.collectRequest(c);
	logCollector.add({ route: "submit" });
	AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
	const data = await c.req.json();
	// Never trust client-supplied prefetchedMeta — only Worker KV cache.
	delete data.prefetchedMeta;
	// submit/curate JWT: Azure Isolated persist. Signed-out → D1.
	if (canCallAzureSubmitBackend(auth0Payload)) {
		let azureBody = data;
		const urlParam = typeof data.url === "string" ? data.url : data.url?.toString?.();
		if (urlParam && c.env.StreamMeta) {
			try {
				const cached = await getStreamMeta(c.env.StreamMeta, new URL(urlParam).toString());
				if (cached) {
					azureBody = { ...data, prefetchedMeta: toPrefetchedMeta(cached) };
					logCollector.add({ event: "submit.prefetched_meta" });
				}
			} catch {
				// Invalid url — Azure will 400; leave body without meta.
			}
		}
		const resp = await proxyToAzure(c, {
			permission: azureSubmitProxyPermission(auth0Payload),
			endpoint: Endpoint.submit,
			method: "POST",
			body: JSON.stringify(azureBody),
			successStatuses: [200],
			forwardStatuses: [400, 404, 409],
			logName: "secure-submit-endpoint"
		});
		if (resp.status === 200) {
			resp.headers.set("X-Origin", "true");
			return resp;
		}
		if (resp.status === 400 || resp.status === 404 || resp.status === 409) {
			logCollector.emitWarn({ event: "submit.azure_client_error", status: resp.status });
			return resp;
		}
		logCollector.add({ event: "submit.azure_failed" });
	}
	logCollector.add({ event: "submit.d1_fallback" });
	const adapter = new PrismaD1(c.env.apiDB);
	const prisma = new PrismaClient({ adapter });
	let url: URL | undefined;
	let urlParam = data.url;
	if (urlParam == null) {
		logCollector.emitError({ event: "submit.missing_url", outcome: "error" });
		return c.json({ error: "Missing url param." }, 400);
	}
	try {
		url = new URL(urlParam);
	} catch {
		logCollector.emitError({ event: "submit.invalid_url", outcome: "error" });
		return c.json({ error: `Invalid url '${data.url}'.` }, 400);
	}
	try {
		const record = {
			url: url.toString(),
			ip_address: c.req.header("CF-Connecting-IP") ?? "Unkown",
			user_agent: c.req.header("User-Agent") ?? null,
			country: c.req.header("CF-IPCountry") ?? null
		};
		await prisma.submissions.create({ data: record });
	} catch (e) {
		if (e instanceof Prisma.PrismaClientKnownRequestError) {
			logCollector.addMessage(`PrismaClientKnownRequestError code: '${e.code}'`);
		}
		logCollector.emitError({ event: "submit.d1_failed", outcome: "error" });
		return c.json({ error: "Unable to accept" }, 400);
	}
	logCollector.emit({ event: "submit.d1_ok", outcome: "success" });
	return c.json({ success: "Submitted" });
}
