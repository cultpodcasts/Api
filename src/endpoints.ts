import { AzureResourcePaths } from "./azureResources";
import { Endpoint } from "./Endpoint";
import { Env } from "./Env";

function functionsOrigin(env: Env): URL {
	const raw = env.azureApiOrigin?.toString().trim();
	if (!raw) {
		throw new Error("azureApiOrigin is not set");
	}
	const origin = new URL(raw);
	return new URL(`${origin.protocol}//${origin.host}`);
}

export function getEndpoint(endpoint: Endpoint, env: Env): URL {
	const path = AzureResourcePaths[endpoint];
	if (path == null) {
		throw new Error(`Unrecognised endpoint: '${endpoint}'.`);
	}
	const url = new URL(path, functionsOrigin(env));
	if (env.overrideHost) {
		url.host = env.overrideHost;
	}
	return url;
}
