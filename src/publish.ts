import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { buildFetchHeaders } from "./buildFetchHeaders";
import { LogCollector } from "./LogCollector";
import { getEndpoint } from "./endpoints";
import { Endpoint } from "./Endpoint";
import { StatusCode } from "hono/utils/http-status";

export async function publishPodcastEpisode(c: Auth0ActionContext): Promise<Response> {
console.log("publishPodcastEpisode called.");
    const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
    const logCollector = new LogCollector();
    logCollector.collectRequest(c);
    const podcastId = c.req.param('podcastId');
    const episodeId = c.req.param('episodeId');
    logCollector.add({ message: `Matched publishPodcastEpisode route for podcastId ${podcastId} and episodeId ${episodeId}.` });
    AddResponseHeaders(c, { methods: ["POST", "GET", "OPTIONS"] });
    if (auth0Payload?.permissions && auth0Payload.permissions.includes('curate')) {
        try {
            const url = new URL(`${getEndpoint(Endpoint.episodePublish, c.env)}/${podcastId}/${episodeId}`);
            logCollector.add({ message: `Publishing to ${url.toString()}.` });
            const data: any = await c.req.json();
            const body: string = JSON.stringify(data);
            const resp = await fetch(url, {
                headers: buildFetchHeaders(c.req, url),
                method: "POST",
                body: body
            });
            if (resp.status == 200) {
                logCollector.add({ message: `Successfully used secure-episode-endpoint.`, status: resp.status });
                console.log(logCollector.toEndpointLog());
                return c.newResponse(resp.body);
            } else {
                logCollector.add({ message: `Failed to use secure-episode-endpoint.`, status: resp.status });
                console.error(logCollector.toEndpointLog());
                return c.newResponse(resp.body, resp.status as StatusCode);
            }
        } catch (error) {
            logCollector.add({ message: `publishPodcastEpisode threw ${(error as Error).message}.` });
            console.error(logCollector.toEndpointLog(), error);
            return c.json({ error: "Error" }, 500);
        }
    }
    logCollector.add({ message: "Unauthorised to use publish." });
    console.error(logCollector.toEndpointLog());
    return c.json({ error: "Unauthorised" }, 403);
}