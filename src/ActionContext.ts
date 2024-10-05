import { Context } from "hono";
import { BlankInput } from "hono/types";
import { Env } from "./Env";
import { AppContext } from "./AppContext";

export type ActionContext = Context<{ Bindings: Env; }, string, BlankInput>;
export type Auth0ActionContext=Context<{ Bindings: Env; } & AppContext, any, BlankInput>;
