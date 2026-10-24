# Discovery curation session (Worker)

Global live room for discovery curation votes, sticky include, and presence. Backed by a single Durable Object (`DiscoveryCurationDurableObject`) named `global`.

## HTTP

| Method | Path | Permission | Notes |
|--------|------|------------|--------|
| GET | `/discovery-curation/session` | `curate` | Snapshot from DO `/state` |
| POST | `/discovery-curation/session/vote` | `curate` | Body: `{ resultId, selected }` — role derived from JWT |
| POST | `/discovery-curation/session/sync-documents` | `curate` | Body: `{ documentIds }` |
| POST | `/discovery-curation/session/include` | `curate` | Body: `{ documentIds }` or `"all"` |
| POST | `/discovery-curation/session/clear-votes` | `curate` | Body: `{ resultIds }` |
| POST | `/discovery-curation/submit-outcome` | `curate` | Azure proxy: reconcile lost Save stamps |

Vote role on HTTP is `discoveryVoteRole(jwt)` (`supervise` / `curate:supervised` / `curate`), never from the client body.

## WebSocket

```mermaid
sequenceDiagram
  participant Client
  participant Worker as Auth0 + upgrade handler
  participant DO as DiscoveryCuration DO

  Client->>Worker: GET /discovery-curation/session/ws?access_token=…
  Note over Client,Worker: Query token only on this path (no Authorization on browser WS)
  Worker->>Worker: JWT → X-User-Id, X-User-Role
  Worker->>DO: Upgrade /ws with trusted headers
  DO->>DO: acceptWebSocket tags [userId, role]
  DO-->>Client: snapshot
  Client->>DO: {"type":"vote","resultId":"…","selected":true,"role":"supervise"}
  Note over DO: Client role ignored; tag role used
  DO-->>Client: vote broadcast (provisional if curate:supervised)
```

- **Auth:** `?access_token=` is accepted **only** for WebSocket upgrade / this path. All other Auth0 routes require `Authorization: Bearer`.
- **Role:** Tagged from `X-User-Role` at accept time. WS vote messages cannot escalate role.
- **Presence:** Closing one tab does not clear presence while another socket for the same `sub` remains connected.

## Related

- Azure Save / submit-outcome: api-infra discovery curation
- Auth0 permissions map: website `docs/auth0-roles-and-permissions.md`
