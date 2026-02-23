import { fromHono } from 'chanfana';
import { Hono } from 'hono';
import { cors } from 'hono/cors'
import { Env } from './Env';
import { Auth0Middleware } from './Auth0Middleware';
import { corsOptions } from "./corsOptions";
import { ProfileDurableObject } from './ProfileDurableObject';
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

const requireOpenApiAuth = async (c: any, next: () => Promise<void>) => {
	const middlewareResult = await Auth0Middleware(c, async () => { });
	if (middlewareResult instanceof Response) {
		return middlewareResult;
	}
	const auth0Payload = c.var.auth0('payload');
	if (!auth0Payload) {
		return c.json({ error: 'Unauthorised' }, 403);
	}
	if (!auth0Payload.permissions || !auth0Payload.permissions.includes('admin')) {
		return c.json({ error: 'Forbidden' }, 403);
	}
	await next();
};

app.use('/*', cors(corsOptions))
app.use('/docs', requireOpenApiAuth);
app.use('/docs/*', requireOpenApiAuth);
app.use('/openapi.json', requireOpenApiAuth);

const openapi = fromHono(app, {
	docs_url: '/docs',
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