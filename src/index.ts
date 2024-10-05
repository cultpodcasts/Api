import { Hono } from 'hono';
import { cors } from 'hono/cors'
import { Env } from './Env';
import { Auth0Middleware } from './Auth0Middleware';
import { getEpisode } from './getEpisode';
import { corsOptions } from "./corsOptions";
import { homepage } from './homepage';
import { getSubjects } from './getSubjects';
import { getFlairs } from './getFlairs';
import { search } from './search';
import { submit } from './submit';
import { updateEpisode } from './updateEpisode';
import { publish } from './publish';
import { getOutgoing } from './getOutgoing';
import { getPodcastByName } from './getPodcastByName';
import { updatePodcast } from './updatePodcast';
import { indexPodcastByName } from './indexPodcastByName';
import { getSubjectByName } from './getSubjectByName';
import { updateSubject } from './updateSubject';
import { createSubject } from './createSubject';
import { getDiscoveryReports } from './getDiscoveryReports';
import { submitDiscovery } from './submitDiscovery';
import { runSearchIndexer } from './runSearchIndexer';
import { publishHomepage } from './publishHomepage';
import { publishTerm } from './publishTerm';

const app = new Hono<{ Bindings: Env }>();

app.use('/*', cors(corsOptions))
app.get('/homepage', homepage);
app.get('/subjects', Auth0Middleware, getSubjects);
app.get('/flairs', Auth0Middleware, getFlairs);
app.post("/search", search);
app.post("/submit", Auth0Middleware, submit);
app.get("/episode/:id", Auth0Middleware, getEpisode);
app.post("/episode/:id", Auth0Middleware, updateEpisode);
app.post("/episode/publish/:id", Auth0Middleware, publish);
app.get("/episodes/outgoing", Auth0Middleware, getOutgoing);
app.get("/podcast/:name", Auth0Middleware, getPodcastByName);
app.post("/podcast/:id", Auth0Middleware, updatePodcast);
app.post("/podcast/index/:name", Auth0Middleware, indexPodcastByName);
app.get("/subject/:name", Auth0Middleware, getSubjectByName);
app.post("/subject/:id", Auth0Middleware, updateSubject);
app.put("/subject", Auth0Middleware, createSubject);
app.get("/discovery-curation", Auth0Middleware, getDiscoveryReports);
app.post("/discovery-curation", Auth0Middleware, submitDiscovery);
app.post("/searchindex/run", Auth0Middleware, runSearchIndexer);
app.post("/publish/homepage", Auth0Middleware, publishHomepage);
app.post("/terms", Auth0Middleware, publishTerm);

export default app;
