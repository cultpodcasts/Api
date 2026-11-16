import { Auth0ActionContext } from "./Auth0ActionContext";
import { isPermittedForAzureProxy, proxyToAzure, ProxyToAzureOptions } from "./proxyToAzure";

/**
 * Proxies a JSON command body to Azure (the film, TV show and news moves). An empty body is sent as `{}`; Azure validates the
 * fields. A body that is not JSON is a 400 with `bodyHint`, but only for a caller that passes `options.permission`: anyone
 * else gets proxyToAzure's 401 / 403 (no fetch), so the body is never judged before the permission.
 */
export async function proxyJsonCommandToAzure(
	c: Auth0ActionContext,
	options: ProxyToAzureOptions,
	bodyHint: string
): Promise<Response> {
	const text = await c.req.text();
	let data: unknown = {};
	if (text.trim().length > 0) {
		try {
			data = JSON.parse(text);
		} catch {
			if (!isPermittedForAzureProxy(c.var.auth0("payload"), options.permission)) {
				return proxyToAzure(c, { ...options, body: undefined });
			}
			return c.json({ error: `Body must be JSON: { ${bodyHint} }` }, 400);
		}
	}
	return proxyToAzure(c, { ...options, body: JSON.stringify(data) });
}
