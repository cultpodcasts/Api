import { parseJwt } from '@cfworker/jwt';
import { fromHono } from 'chanfana';
import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { cors } from 'hono/cors'
import { Env } from './Env';
import { Auth0JwtPayload } from './Auth0JwtPayload';
import { corsOptions } from "./corsOptions";
import { ProfileDurableObject } from './ProfileDurableObject';
import { buildDocsPageHtml } from './resources/docsPageHtml';
import {
	AddBookmarkRoute,
	CreateSubjectRoute,
	DeleteBookmarkRoute,
	DeleteEpisodeRoute,
	GetBookmarksRoute,
	GetDiscoveryInfoRoute,
	GetDiscoveryReportsRoute,
	GetEpisodeRoute,
	GetFlairsRoute,
	GetLanguagesRoute,
	GetOutgoingRoute,
	GetPageDetailsRoute,
	GetPodcastByNameAndEpisodeIdRoute,
	GetPodcastByNameRoute,
	GetSubjectByNameRoute,
	GetSubjectsRoute,
	HomepageRoute,
	HomepageSsrRoute,
	IndexPodcastByNameRoute,
	PublicGetEpisodeRoute,
	PublishEpisodeRoute,
	PublishHomepageRoute,
	PublishTermRoute,
	PushSubscriptionRoute,
	RenamePodcastRoute,
	RunSearchIndexerRoute,
	SearchRoute,
	SubmitDiscoveryRoute,
	SubmitRoute,
	UpdateEpisodeRoute,
	UpdatePodcastPostRoute,
	UpdatePodcastPutRoute,
	UpdateSubjectRoute
} from './openapiRoutes';

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
	return !!payload?.permissions?.includes('admin');
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

	const bearerToken = getBearerToken(c);
	const cookieToken = getCookie(c, OPENAPI_AUTH_COOKIE);
	const payload = await tryGetPayload(c, bearerToken ?? cookieToken);
	if (!payload) {
		if (pathname.startsWith('/docs')) {
			return c.redirect('/docs/login');
		}
		return c.json({ error: 'Unauthorised' }, 403);
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
		return c.json({ error: 'Invalid auth state' }, 403);
	}

	const payload = await tryGetPayload(c, token);
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

app.get('/docs', (c) => {
	return c.html(buildDocsPageHtml({
		auth0Issuer: normalizeIssuer(c.env.auth0Issuer),
		auth0Audience: trimValue(c.env.auth0Audience),
		auth0ClientId: trimValue(c.env.auth0ClientId)
	}));
});

const openapi = fromHono(app, {
	docs_url: null,
	openapi_url: '/openapi.json',
	schema: {
		info: {
			title: 'Cult Podcasts API',
			version: '1.0.3'
		}
	}
});

openapi.get('/homepage', HomepageRoute);
openapi.get('/homepage-ssr', HomepageSsrRoute);
openapi.get('/subjects', GetSubjectsRoute);
openapi.get('/flairs', GetFlairsRoute);
openapi.post('/search', SearchRoute);
openapi.post('/submit', SubmitRoute);
openapi.get('/episode/:id', GetEpisodeRoute);
openapi.post('/episode/:id', UpdateEpisodeRoute);
openapi.delete('/episode/:id', DeleteEpisodeRoute);
openapi.post('/episode/publish/:id', PublishEpisodeRoute);
openapi.get('/episodes/outgoing', GetOutgoingRoute);
openapi.get('/podcast/:name', GetPodcastByNameRoute);
openapi.get('/podcast/:name/:id', GetPodcastByNameAndEpisodeIdRoute);
openapi.post('/podcast/:id', UpdatePodcastPostRoute);
openapi.put('/podcast/:id', UpdatePodcastPutRoute);
openapi.post('/podcast/index/:name', IndexPodcastByNameRoute);
openapi.get('/subject/:name', GetSubjectByNameRoute);
openapi.post('/subject/:id', UpdateSubjectRoute);
openapi.put('/subject', CreateSubjectRoute);
openapi.get('/discovery-curation', GetDiscoveryReportsRoute);
openapi.post('/discovery-curation', SubmitDiscoveryRoute);
openapi.get('/discovery-info', GetDiscoveryInfoRoute);
openapi.post('/searchindex/run', RunSearchIndexerRoute);
openapi.post('/publish/homepage', PublishHomepageRoute);
openapi.post('/terms', PublishTermRoute);
openapi.post('/podcast/name/:name', RenamePodcastRoute);
openapi.post('/pushsubscription', PushSubscriptionRoute);
openapi.get('/pagedetails/:podcastName/:episodeId', GetPageDetailsRoute);
openapi.post('/bookmark/:episodeId', AddBookmarkRoute);
openapi.delete('/bookmark/:episodeId', DeleteBookmarkRoute);
openapi.get('/bookmarks', GetBookmarksRoute);
openapi.get('/public/episode/:id', PublicGetEpisodeRoute);
openapi.get('/languages', GetLanguagesRoute);

export default app;
export { ProfileDurableObject };