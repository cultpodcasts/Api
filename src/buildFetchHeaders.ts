import { HonoRequest } from "hono";

export function buildFetchHeaders(request: HonoRequest, downstream: URL): HeadersInit {
	const auth = request.header("Authorization");
	if (!auth) {
		throw new Error("Missing auth-header");
	}
	console.log(`Using auth header '${auth.slice(0, 20)}..'`);
	return {
		'Accept': "*/*",
		'Authorization': auth,
		"Content-type": "application/json",
		"Cache-Control": "no-cache",
		"User-Agent": "cult-podcasts-api",
		"Host": downstream.host
	};
}
