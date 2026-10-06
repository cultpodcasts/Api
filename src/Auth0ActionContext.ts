import { Context } from "hono";
import { BlankInput } from "hono/types";
import { AppContext } from "./AppContext";
import { Env } from "./Env";

// Hono 4.13 types c.req.param(key) as string | undefined unless the path
// pattern names that parameter as required. These handlers are shared across
// routes, so list every parameter they read.
type HandlerPath =
	"/:code/:episodeId/:id/:identifier/:language/:literal/:name/:podcastId/:podcastName/:term";

export type Auth0ActionContext = Context<{ Bindings: Env; } & AppContext, HandlerPath, BlankInput>;
