import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { buildFetchHeaders } from "./buildFetchHeaders";
import { LogCollector } from "./LogCollector";
import { getEndpoint, Endpoint } from "./endpoints";

export async function submit(c: Auth0ActionContext): Promise<Response> {
	const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
	const logCollector = new LogCollector();
	logCollector.collectRequest(c);
	AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
	const data = await c.req.json();
	if (auth0Payload?.permissions && auth0Payload.permissions.includes('submit')) {
		const resp = await fetch(getEndpoint(Endpoint.submit, c.env), {
			headers: buildFetchHeaders(c.req, c.env.secureSubmitEndpoint),
			body: JSON.stringify(data),
			method: "POST"
		});
		if (resp.status == 200) {
			logCollector.add({ message: `Successfully used secure-submit-endpoint.`, status: resp.status });
			console.log(logCollector.toEndpointLog());
			var response = new Response(resp.body);
			response.headers.set("content-type", "application/json; charset=utf-8");
			response.headers.set("X-Origin", "true");
			return response;
		} else {
			logCollector.add({ message: `Failed to use secure-submit-endpoint.`, status: resp.status });
			console.error(logCollector.toEndpointLog());
		}
	}
	logCollector.add({ message: `Storing submission in d1.` });
	const adapter = new PrismaD1(c.env.apiDB);
	const prisma = new PrismaClient({ adapter });
	let url: URL | undefined;
	let urlParam = data.url;
	if (urlParam == null) {
		logCollector.add({ message: "Missing url param" });
		console.error(logCollector.toEndpointLog());
		return c.json({ error: "Missing url param." }, 400);
	}
	try {
		url = new URL(urlParam);
	} catch {
		logCollector.add({ message: `Invalid url: '${data.url}'.` });
		console.error(logCollector.toEndpointLog());
		return c.json({ error: `Invalid url '${data.url}'.` }, 400);
	}
	try {
		const record = {
			url: url.toString(),
			ip_address: c.req.header("CF-Connecting-IP") ?? "Unkown",
			user_agent: c.req.header("User-Agent") ?? null,
			country: c.req.header("CF-IPCountry") ?? null
		};
		const submission = await prisma.submissions.create({
			data: record
		});
		logCollector.add({ message: "Stored url in db." });
	} catch (e) {
		if (e instanceof Prisma.PrismaClientKnownRequestError) {
			logCollector.add({ message: `PrismaClientKnownRequestError code: '${e.code}', error: '${e}'.` });
		} else {
			logCollector.add({ message: "Unable to accept" });
		}
		console.error(logCollector.toEndpointLog());
		return c.json({ error: "Unable to accept" }, 400);
	}
	console.log(logCollector.toEndpointLog());
	return c.json({ success: "Submitted" });
}
