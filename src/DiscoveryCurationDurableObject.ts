import { DurableObject } from "cloudflare:workers";
import { Env } from "./Env";
import {
	addVote,
	applyWsVoteIgnoringClientRole,
	clearVotesForResults,
	DiscoveryCurationSessionState,
	emptyDiscoverySessionState,
	includePending,
	parseTrustedWsRole,
	removeVote,
	shouldClearPresenceOnClose,
	syncOpenDocuments,
	toClientSnapshot,
	touchPresence
} from "./discoveryCurationSessionLogic";

const STORAGE_KEY = "session";
const ROOM_NAME = "global";

/**
 * Single global Durable Object for live discovery curation votes / sticky include / presence.
 * HTTP + hibernation WebSocket; mutations are serialized here.
 *
 * WebSocket tags: `[userId, trustedRole]` — role comes from Worker `X-User-Role`, never from client JSON.
 */
export class DiscoveryCurationDurableObject extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname === "/ws" && request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
			const userId = request.headers.get("X-User-Id") ?? "";
			if (!userId) {
				return new Response("Unauthorised", { status: 401 });
			}
			const role = parseTrustedWsRole(request.headers.get("X-User-Role"));
			const pair = new WebSocketPair();
			this.ctx.acceptWebSocket(pair[1], [userId, role]);
			const state = await this.load();
			const next = touchPresence(state, userId);
			await this.save(next);
			pair[1].send(JSON.stringify({ type: "snapshot", state: toClientSnapshot(next) }));
			this.broadcast(JSON.stringify({ type: "presence", state: toClientSnapshot(next) }), pair[1]);
			return new Response(null, { status: 101, webSocket: pair[0] });
		}

		try {
			if (request.method === "GET" && url.pathname === "/state") {
				return Response.json(toClientSnapshot(await this.load()));
			}

			if (request.method === "POST") {
				const body = (await request.json()) as Record<string, unknown>;
				const userId = String(body.userId ?? "");
				const role = parseTrustedWsRole(String(body.role ?? "curate"));
				let state = await this.load();

				switch (url.pathname) {
					case "/vote": {
						const resultId = String(body.resultId ?? "");
						const selected = Boolean(body.selected);
						if (!userId || !resultId) {
							return Response.json({ error: "userId and resultId required" }, { status: 400 });
						}
						state = selected
							? addVote(state, resultId, userId, role)
							: removeVote(state, resultId, userId);
						await this.save(state);
						const snap = toClientSnapshot(state);
						this.broadcast(JSON.stringify({ type: "vote", state: snap }));
						return Response.json(snap);
					}
					case "/sync-documents": {
						const ids = Array.isArray(body.documentIds)
							? body.documentIds.map(String)
							: [];
						state = syncOpenDocuments(state, ids);
						if (userId) {
							state = touchPresence(state, userId);
						}
						await this.save(state);
						const snap = toClientSnapshot(state);
						this.broadcast(JSON.stringify({ type: "sync", state: snap }));
						return Response.json(snap);
					}
					case "/include": {
						const documentIds =
							body.documentIds === "all"
								? "all"
								: Array.isArray(body.documentIds)
									? body.documentIds.map(String)
									: [];
						state = includePending(state, documentIds);
						if (userId) {
							state = touchPresence(state, userId);
						}
						await this.save(state);
						const snap = toClientSnapshot(state);
						this.broadcast(JSON.stringify({ type: "include", state: snap }));
						return Response.json(snap);
					}
					case "/clear-votes": {
						const resultIds = Array.isArray(body.resultIds)
							? body.resultIds.map(String)
							: [];
						state = clearVotesForResults(state, resultIds);
						await this.save(state);
						const snap = toClientSnapshot(state);
						this.broadcast(JSON.stringify({ type: "clear", state: snap }));
						return Response.json(snap);
					}
					default:
						return new Response("Not found", { status: 404 });
				}
			}

			return new Response("Not found", { status: 404 });
		} catch (e) {
			console.error("DiscoveryCurationDurableObject.fetch", e);
			return Response.json({ error: "Error" }, { status: 500 });
		}
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
		const tags = this.ctx.getTags(ws);
		const userId = tags[0] ?? "";
		const trustedRole = parseTrustedWsRole(tags[1]);
		if (!userId || typeof message !== "string") {
			return;
		}
		let parsed: { type?: string; resultId?: string; selected?: boolean; role?: string };
		try {
			parsed = JSON.parse(message) as typeof parsed;
		} catch {
			return;
		}
		let state = await this.load();
		if (parsed.type === "vote" && parsed.resultId) {
			state = applyWsVoteIgnoringClientRole(state, userId, trustedRole, {
				resultId: parsed.resultId,
				selected: parsed.selected,
				role: parsed.role
			});
			await this.save(state);
			this.broadcast(JSON.stringify({ type: "vote", state: toClientSnapshot(state) }));
			return;
		}
		if (parsed.type === "ping") {
			state = touchPresence(state, userId);
			await this.save(state);
			ws.send(JSON.stringify({ type: "pong", state: toClientSnapshot(state) }));
		}
	}

	async webSocketClose(ws: WebSocket): Promise<void> {
		const tags = this.ctx.getTags(ws);
		const userId = tags[0];
		if (!userId) {
			return;
		}
		const otherUserIds = this.ctx
			.getWebSockets()
			.filter((socket) => socket !== ws)
			.map((socket) => this.ctx.getTags(socket)[0])
			.filter((id): id is string => Boolean(id));
		if (!shouldClearPresenceOnClose(userId, otherUserIds)) {
			return;
		}
		const state = await this.load();
		const presence = { ...state.presence };
		delete presence[userId];
		const next = { ...state, presence, updatedAt: new Date().toISOString() };
		await this.save(next);
		this.broadcast(JSON.stringify({ type: "presence", state: toClientSnapshot(next) }));
	}

	private broadcast(message: string, except?: WebSocket): void {
		for (const socket of this.ctx.getWebSockets()) {
			if (except && socket === except) {
				continue;
			}
			try {
				socket.send(message);
			} catch {
				/* closed */
			}
		}
	}

	private async load(): Promise<DiscoveryCurationSessionState> {
		const stored = await this.ctx.storage.get<DiscoveryCurationSessionState>(STORAGE_KEY);
		if (stored && Array.isArray(stored.includedDocumentIds)) {
			return {
				...emptyDiscoverySessionState(),
				...stored,
				votesByResultId: stored.votesByResultId ?? {},
				presence: stored.presence ?? {}
			};
		}
		return emptyDiscoverySessionState();
	}

	private async save(state: DiscoveryCurationSessionState): Promise<void> {
		await this.ctx.storage.put(STORAGE_KEY, state);
	}
}

export function discoveryCurationSessionStub(
	env: Env
): DurableObjectStub<DiscoveryCurationDurableObject> {
	const id = env.DISCOVERY_CURATION_DURABLE_OBJECT.idFromName(ROOM_NAME);
	return env.DISCOVERY_CURATION_DURABLE_OBJECT.get(id);
}
