import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient, Prisma } from "@prisma/client";
import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { LogCollector } from "./LogCollector";
import { proxyToAzure } from "./proxyToAzure";

export async function submit(c: Auth0ActionContext): Promise<Response> {
	const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
	const logCollector = new LogCollector();
	logCollector.collectRequest(c);
	AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
	const data = await c.req.json();
	if (auth0Payload?.permissions && auth0Payload.permissions.includes('submit')) {
		const resp = await proxyToAzure(c, {
			permission: "submit",
			endpoint: Endpoint.submit,
			method: "POST",
			body: JSON.stringify(data),
			successStatuses: [200],
			logName: "secure-submit-endpoint"
		});
		if (resp.status == 200) {
			resp.headers.set("X-Origin", "true");
			return resp;
		}
		logCollector.addMessage(`Failed to use secure-submit-endpoint.`);
	}
	logCollector.addMessage(`Storing submission in d1.`);
	const adapter = new PrismaD1(c.env.apiDB);
	const prisma = new PrismaClient({ adapter });
	let url: URL | undefined;
	let urlParam = data.url;
	if (urlParam == null) {
		logCollector.addMessage("Missing url param");
		console.error(logCollector.toEndpointLog());
		return c.json({ error: "Missing url param." }, 400);
	}
	try {
		url = new URL(urlParam);
	} catch {
		logCollector.addMessage(`Invalid url: '${data.url}'.`);
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
		logCollector.addMessage("Stored url in db.");
	} catch (e) {
		if (e instanceof Prisma.PrismaClientKnownRequestError) {
			logCollector.addMessage(`PrismaClientKnownRequestError code: '${e.code}', error: '${e}'.`);
		} else {
			logCollector.addMessage("Unable to accept");
		}
		console.error(logCollector.toEndpointLog());
		return c.json({ error: "Unable to accept" }, 400);
	}
	console.log(logCollector.toEndpointLog());
	return c.json({ success: "Submitted" });
}
