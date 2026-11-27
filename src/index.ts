import { parseJwt } from '@cfworker/jwt';
import { fromHono } from 'chanfana';
import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { cors } from 'hono/cors'
import { Env } from './Env';
import { Auth0JwtPayload } from './Auth0JwtPayload';
import { hasPermission } from './hasPermission';
import { corsOptions } from "./corsOptions";
import { ProfileDurableObject } from './ProfileDurableObject';
import { ProfileDurableObjectLegacy } from './ProfileDurableObjectLegacy';
import { HeroCurationDurableObject } from './HeroCurationDurableObject';
import { DiscoveryCurationDurableObject } from './DiscoveryCurationDurableObject';
import { pruneHeroCurationScheduled } from './pruneHeroCurationScheduled';
import { buildDocsPageHtml } from './resources/docsPageHtml';
import { SEARCH_SHADOW_SOAK_PATH, searchShadowSoakPage } from './searchShadowSoakPage';
import { openApiDocumentVersion, openApiInfoForEnvironment, resolveApiEnvironment } from './apiEnvironment';
import { registerBearerAuthScheme } from './openapiRouteFactory';
import { registerOpenApiRoutes } from './registerOpenApiRoutes';
const app = new Hono<{ Bindings: Env }>();
const OPENAPI_AUTH_COOKIE = 'openapi_access_token';
const OPENAPI_AUTH_STATE_COOKIE = 'openapi_auth_state';

const trimValue = (value: string | undefined | null): string | undefined => {
	if (value == null) {
		return undefined;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeIssuer = (value: string | undefined | null): string | undefined => {
	const trimmed = trimValue(value);
	if (!trimmed) {
		return undefined;
	}
	try {
		return new URL(trimmed).toString();
	} catch {
		try {
			return new URL(`https://${trimmed}`).toString();
		} catch {
			return undefined;
		}
	}
};

const tryGetPayload = async (c: any, token: string | undefined): Promise<Auth0JwtPayload | null> => {
	const issuer = normalizeIssuer(c.env.auth0Issuer);
	const audience = trimValue(c.env.auth0Audience);
	if (!token || !issuer || !audience) {
		return null;
	}
	const result = await parseJwt(token, issuer, audience);
	if (!result.valid) {
		return null;
	}
	return result.payload as Auth0JwtPayload;
};

const getBearerToken = (c: any): string | undefined => {
	const authorization = c.req.header('Authorization');
	const bearer = 'Bearer ';
	if (!authorization || !authorization.startsWith(bearer)) {
		return undefined;
	}
	return authorization.slice(bearer.length);
};

const isAdmin = (payload: Auth0JwtPayload | null): boolean => {
	return hasPermission(payload, 'admin');
};

const isOpenApiAuthBypassPath = (pathname: string): boolean => {
	return pathname === '/docs/login' ||
		pathname === '/docs/callback' ||
		pathname === '/docs/auth/callback' ||
		pathname === '/docs/logout';
};

const requireOpenApiAuth = async (c: any, next: () => Promise<void>) => {
	const pathname = new URL(c.req.url).pathname;
	if (isOpenApiAuthBypassPath(pathname)) {
		await next();
		return;
	}

	// Each credential is verified on its own. A stale bearer (Swagger UI's saved token, sent on its
	// /openapi.json fetch) must not hide a valid docs-session cookie, or /docs loads but its API
	// definition 401s (Api #310). Either way the admin check below applies to whichever verified.
	const bearerToken = getBearerToken(c);
	const cookieToken = getCookie(c, OPENAPI_AUTH_COOKIE);
	let payload = await tryGetPayload(c, bearerToken);
	if (!payload && cookieToken && cookieToken !== bearerToken) {
		payload = await tryGetPayload(c, cookieToken);
	}
	if (!payload) {
		if (pathname.startsWith('/docs')) {
			return c.redirect('/docs/login');
		}
		return c.json({ error: 'Unauthorised' }, 401);
	}
	if (!isAdmin(payload)) {
		return c.json({ error: 'Forbidden' }, 403);
	}

	await next();
};

app.use('/*', cors(corsOptions))
app.use('/docs', requireOpenApiAuth);
app.use('/docs/*', requireOpenApiAuth);
app.use('/openapi.json', requireOpenApiAuth);
app.use('/openapi.json', async (c, next) => {
	await next();
	if (c.res.status < 200 || c.res.status >= 300) {
		return;
	}
	const environment = resolveApiEnvironment(
		c.env.apiEnvironment,
		new URL(c.req.url).hostname
	);
	if (environment === 'production') {
		return;
	}
	try {
		const body = await c.res.json() as {
			info?: { title?: string; version?: string; description?: string };
		};
		const info = openApiInfoForEnvironment(environment, body.info?.version ?? openApiDocumentVersion);
		body.info = { ...body.info, ...info };
		c.res = new Response(JSON.stringify(body), {
			status: c.res.status,
			headers: c.res.headers
		});
	} catch {
		// Leave original openapi.json if rewrite fails.
	}
});

app.get('/docs/login', (c) => {
	const issuer = normalizeIssuer(c.env.auth0Issuer);
	const audience = trimValue(c.env.auth0Audience);
	const clientId = trimValue(c.env.auth0ClientId);

	if (!issuer || !audience || !clientId) {
		return c.json({ error: 'Auth0 docs login not configured' }, 500);
	}

	const requestUrl = new URL(c.req.url);
	const state = crypto.randomUUID();
	setCookie(c, OPENAPI_AUTH_STATE_COOKIE, state, {
		httpOnly: true,
		secure: true,
		sameSite: 'Strict',
		path: '/docs',
		maxAge: 300
	});

	const authorizeUrl = new URL('/authorize', issuer);
	authorizeUrl.searchParams.set('response_type', 'token');
	authorizeUrl.searchParams.set('client_id', clientId);
	authorizeUrl.searchParams.set('redirect_uri', `${requestUrl.origin}/docs/callback`);
	authorizeUrl.searchParams.set('audience', audience);
	authorizeUrl.searchParams.set('scope', 'openid profile email');
	authorizeUrl.searchParams.set('state', state);

	return c.redirect(authorizeUrl.toString());
});

app.get('/docs/callback', (c) => {
	const html = `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Authenticating...</title></head>
  <body>
    <script>
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = hashParams.get('access_token');
      const state = hashParams.get('state');
      if (!accessToken || !state) {
        window.location.replace('/docs/login');
      } else {
        const next = '/docs/auth/callback?access_token=' + encodeURIComponent(accessToken) + '&state=' + encodeURIComponent(state);
        window.location.replace(next);
      }
    </script>
  </body>
</html>`;
	return c.html(html);
});

app.get('/docs/auth/callback', async (c) => {
	const state = c.req.query('state');
	const token = c.req.query('access_token');
	const stateCookie = getCookie(c, OPENAPI_AUTH_STATE_COOKIE);

	if (!state || !stateCookie || state !== stateCookie) {
		return c.json({ error: 'Invalid auth state' }, 401);
	}

	const payload = await tryGetPayload(c, token);
	if (!payload) {
		return c.json({ error: 'Unauthorised' }, 401);
	}
	if (!isAdmin(payload)) {
		return c.json({ error: 'Forbidden' }, 403);
	}

	setCookie(c, OPENAPI_AUTH_COOKIE, token!, {
		httpOnly: true,
		secure: true,
		sameSite: 'Strict',
		path: '/'
	});
	setCookie(c, OPENAPI_AUTH_STATE_COOKIE, '', {
		httpOnly: true,
		secure: true,
		sameSite: 'Strict',
		path: '/docs',
		maxAge: 0,
		expires: new Date(0)
	});

	return c.redirect('/docs');
});

app.get('/docs/logout', (c) => {
	setCookie(c, OPENAPI_AUTH_COOKIE, '', {
		httpOnly: true,
		secure: true,
		sameSite: 'Strict',
		path: '/',
		maxAge: 0,
		expires: new Date(0)
	});
	setCookie(c, OPENAPI_AUTH_STATE_COOKIE, '', {
		httpOnly: true,
		secure: true,
		sameSite: 'Strict',
		path: '/docs',
		maxAge: 0,
		expires: new Date(0)
	});
	return c.json({ message: 'Logged out from docs session' });
});

// Admin-only via requireOpenApiAuth on /docs/* (cultpodcasts/Api#304).
app.get(SEARCH_SHADOW_SOAK_PATH, (c) => searchShadowSoakPage(c));

app.get('/docs', (c) => {
	return c.html(buildDocsPageHtml({
		auth0Issuer: normalizeIssuer(c.env.auth0Issuer),
		auth0Audience: trimValue(c.env.auth0Audience),
		auth0ClientId: trimValue(c.env.auth0ClientId),
		apiEnvironment: resolveApiEnvironment(
			c.env.apiEnvironment,
			new URL(c.req.url).hostname
		)
	}));
});

const openapi = fromHono(app, {
	docs_url: null,
	openapi_url: '/openapi.json',
	schema: {
		info: {
			title: 'Cult Podcasts API',
			version: openApiDocumentVersion
		}
	}
});
registerBearerAuthScheme(
	(openapi as unknown as {
		registry: Parameters<typeof registerBearerAuthScheme>[0];
	}).registry
);

registerOpenApiRoutes(openapi);

export default {
	fetch: app.fetch,
	async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
		ctx.waitUntil(pruneHeroCurationScheduled(env));
	}
};
export {
	ProfileDurableObject,
	ProfileDurableObjectLegacy,
	HeroCurationDurableObject,
	DiscoveryCurationDurableObject
};