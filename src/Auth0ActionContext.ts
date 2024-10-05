import { Context } from "hono";
import { BlankInput } from "hono/types";
import { AppContext } from "./AppContext";
import { Env } from "./Env";

export type Auth0ActionContext = Context<{ Bindings: Env; } & AppContext, any, BlankInput>;
