import { stream } from "hono/streaming";

import { AddResponseHeaders } from "./AddResponseHeaders";

import { Auth0JwtPayload } from "./Auth0JwtPayload";

import { Auth0ActionContext } from "./Auth0ActionContext";

import { buildFetchHeaders } from "./buildFetchHeaders";

import { getEndpoint } from "./endpoints";

import { Endpoint } from "./Endpoint";

import { LogCollector } from "./LogCollector";



export async function getPeople(c: Auth0ActionContext): Promise<Response> {

	const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');

	const logCollector = new LogCollector();

	logCollector.collectRequest(c);

	if (auth0Payload?.permissions && auth0Payload.permissions.includes('curate')) {

		let object: R2ObjectBody | null = null;

		try {

			object = await c.env.Content.get("people");

		} catch {

			logCollector.addMessage("Unable to retrieve people");

		}

		if (object !== null) {

			AddResponseHeaders(c, { etag: object.httpEtag, methods: ["GET", "OPTIONS"] });

			logCollector.addMessage("Successfully obtained people data.");

			console.log(logCollector.toEndpointLog());

			return stream(c, async (stream) => {

				stream.onAbort(() => {

					logCollector.addMessage('Aborted!');

					console.error(logCollector.toEndpointLog());

				});

				await stream.pipe(object.body);

			});

		}



		try {

			const url = getEndpoint(Endpoint.people, c.env);

			const resp = await fetch(url, {

				headers: buildFetchHeaders(c.req, url),

				method: "GET"

			});

			logCollector.add({ status: resp.status });

			if (resp.status === 200) {

				logCollector.addMessage("Successfully used secure-people-endpoint.");

				console.log(logCollector.toEndpointLog());

				AddResponseHeaders(c, { omitCacheControlHeader: true, methods: ["GET", "OPTIONS"] });

				return c.newResponse(resp.body);

			}

		} catch {

			logCollector.addMessage("Unable to retrieve people from secure endpoint");

		}



		logCollector.addMessage(logCollector.message ?? "No people object found");

		console.error(logCollector.toEndpointLog());

		return c.notFound();

	} else if (!auth0Payload) {

		logCollector.addMessage("Unauthorised to use getPeople.");

		console.error(logCollector.toEndpointLog());

		return c.json({ error: "Unauthorised" }, 401);

	} else {

		logCollector.addMessage("Forbidden to use getPeople.");

		console.error(logCollector.toEndpointLog());

		return c.json({ error: "Forbidden" }, 403);

	}

}

