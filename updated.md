# SDK Update Plan (2026-04-23)

## Why this exists

After the big backend refactor on 2026-04-23 (50 commits landing repositories, services, zod schemas, OpenAPI, etc.), the SDK at `/Users/brightqi/Development/play/bq/baobox-sdk` is out of sync with the live `baobox` worker. Documenting the gap here so we can fix it deliberately when the Email feature work is done, without losing context.

---

## What's broken

### 1. Three endpoint paths don't exist on the backend

| SDK method | SDK hits | Backend actually exposes | Result |
|---|---|---|---|
| `bb.admin.skills.upsert()` | `POST /api/v1/admin/skills` | `POST /api/v1/skills` | 404 |
| `bb.admin.tools.upsert()` | `POST /api/v1/admin/tools` | `POST /api/v1/tools` | 404 |
| `bb.events.list()` | `GET /api/v1/events?session_id=...` | `GET /api/v1/sessions/{id}/timeline` | 404 |

The `/api/v1/admin/*` prefix is reserved for API-key / call-log management and scheduled-task CRUD on the backend. Skills and tools moved to top-level `/api/v1/skills` + `/api/v1/tools` some time ago, and the SDK was never updated.

### 2. Auth model mismatch

SDK takes a single `apiKey` option and uses it as `Authorization: Bearer ${apiKey}` for every request. The backend splits auth:

- `/api/v1/chat` — requires an API key issued by `POST /api/v1/admin/keys` (matches a row in `api_keys` table)
- `/api/v1/admin/*`, `/api/v1/skills/*`, `/api/v1/tools/*`, `/api/v1/eval/*` — requires `Bearer $ADMIN_SECRET` (soft-gate if ADMIN_SECRET unset, hard 401 if set and wrong)

So even when the paths get fixed, `bb.admin.skills.upsert()` with a chat API key will fail on ADMIN_SECRET-configured workers (sandbox with secret set, or JV1 tenant). The SDK needs either (a) a second `adminSecret` option, or (b) to drop the admin surface entirely and leave admin ops to curl/Swagger UI.

### 3. Response shape drift (minor)

The backend `ApiResponse<T>` envelope has `metadata` with camelCase-free fields:
```ts
{ data: T, metadata: { request_id, latency_ms, model?, trace? } }
```

The SDK transforms this into camelCase (`requestId`, `latencyMs`, etc.) which is fine. But the current SDK:

- Doesn't map `model` or `trace` for most endpoints — OK since they're undefined there
- Assumes `input_schema` and `handler_config` come back as **strings** for Tool responses (correct — the backend stores them JSON-stringified and returns as-is). SDK sends them as objects on POST (correct — backend `createToolRequestSchema` uses `z.record()` for both fields). Consistent with current backend.

### 4. Missing endpoints

Backend now has 41 operations across 7 tags. SDK covers 5:
- `chat` (POST /api/v1/chat)
- `sessions.create` (POST /api/v1/sessions)
- `sessions.messages` (GET /api/v1/sessions/:id/messages)
- `admin.skills.upsert` (broken path)
- `admin.tools.upsert` (broken path)
- `events.list` (broken path)

Missing entirely from SDK:
- Skills: list, get, delete, import, file CRUD
- Tools: list, get, delete, attach/detach to skill, secret CRUD
- Sessions: get, timeline, delete
- Admin: keys list/delete, stats, logs, scheduled tasks CRUD
- Eval: list/create/delete test cases, run, get run, stats, failures, compare

---

## Recommended fix plan

Split into two tracks based on urgency:

### Track A — Minimum viable (unblock existing SDK callers)

Goal: make the 3 broken paths point at real endpoints. ~1 commit.

1. `src/index.ts::upsertSkill()` — change path from `/api/v1/admin/skills` to `/api/v1/skills`
2. `src/index.ts::upsertTool()` — change path from `/api/v1/admin/tools` to `/api/v1/tools`
3. `src/index.ts::listEvents()` — change from `/api/v1/events?session_id=X` to `/api/v1/sessions/${sessionId}/timeline`. Note the response shape is `{ data: { session_id, events: [...] }, metadata: ... }` (wrapped), not a flat `Event[]` — update the parser accordingly.
4. Update SDK tests in `baobox-sdk/test/` to assert new paths

Does NOT fix the auth model — after Track A, admin methods still only work when ADMIN_SECRET is unset.

### Track B — Auth model + coverage (make SDK a real library)

Goal: second-class citizen treatment for admin ops (you can keep using curl or Swagger if you prefer). ~3-4 commits.

1. Add `adminSecret?: string` to `BaoBoxClientOptions`
2. Add an `this.requestAdmin<T>(...)` method that uses `adminSecret` instead of `apiKey` for the Authorization header, throws if unset
3. Migrate all `/admin/*`, `/skills/*`, `/tools/*`, `/eval/*` methods to `requestAdmin`
4. Expand coverage: add the missing SDK methods for the 35+ endpoints that aren't covered yet — generate from `/openapi.json`? Or hand-write per method matching Swagger?

### Track C — Giving up on admin in the SDK (simpler alternative to B)

Remove all admin methods from the SDK. SDK becomes chat + sessions + event timeline only — the "runtime" surface end-user apps care about. Admin operations (create skill, create tool, run eval) are tooling work done via curl/Swagger/CLI.

Pro: SDK gets smaller, simpler, more focused. Pro: no two-credential confusion.
Con: internal tooling / sync scripts need curl / a separate admin client.

I'd actually lean toward **C** — most SDK consumers will be customer-facing apps that need chat + history, not admin access. Admin is rare enough that "paste into Swagger UI Authorize → Try it out" is fine.

---

## Sequencing

Don't start this until the Email feature work is done. Then decide Track A alone (cheap unblock), or jump straight to Track C (cleaner long-term).

## When you resume

1. Read this file
2. Read `HANDOVER.md` in baobox for current backend state
3. Pull the latest `/openapi.json` from local dev to see the full endpoint list
4. Decide Track A vs C (skip B unless external SDK users have materialized)
