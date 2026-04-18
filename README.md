# @skillbox/sdk

TypeScript HTTP client for [SkillBox](https://skillbox.au) — an AI integration platform providing an agent runtime, eval engine, and observability trail.

This package is a thin wrapper around SkillBox's REST API. It has zero business logic — all intelligence lives server-side. Making it public removes friction for partners and third-party users while keeping the runtime closed.

## Installation

```bash
npm install @skillbox/sdk
# or
pnpm add @skillbox/sdk
```

Requires Node.js 18+ (relies on native `fetch`).

## Quick start

```typescript
import { SkillBoxClient } from "@skillbox/sdk";

const sb = new SkillBoxClient({
  endpoint: "https://skillbox-jv1.example.workers.dev",
  apiKey: process.env.SKILLBOX_API_KEY!,
});

const res = await sb.chat({
  skillId: "sk_document_chaser",
  message: "Review cli_01 and take whatever action is needed.",
  sessionId: "ses_cli_01",
});

console.log(res.response);          // "Sent chase email for bank_statement, payroll..."
console.log(res.meta.requestId);    // "req_abc123" — matches server log
console.log(res.meta.trace);        // [{ toolName, input, output, latencyMs }, ...]
```

## API surface

### Chat

```typescript
const res = await sb.chat({
  skillId: "sk_chase",
  message: "...",
  sessionId: "ses_1",                         // optional
  metadata: { source: "kanban" },             // optional, forwarded to trace
});
```

Returns `{ response, usage: { inputTokens, outputTokens }, sessionId, meta }` where `meta` carries `requestId`, `latencyMs`, `model`, and an optional `trace` array.

### Sessions

```typescript
const session = await sb.sessions.create({ skillId: "sk_chase" });
const history = await sb.sessions.messages(session.id);
```

### Admin (requires admin token)

```typescript
await sb.admin.skills.upsert({
  id: "sk_chase",
  name: "Document Chaser",
  systemPrompt: "...",
  model: "MiniMax-M2.7",
  tools: ["lookup_client_docs", "send_client_email"],
});

await sb.admin.tools.upsert({
  name: "lookup_client_docs",
  description: "...",
  inputSchema: { type: "object", properties: { /* ... */ } },
  handlerType: "http",
  handlerConfig: { url: "https://backend.example.com/tools/lookup", /* ... */ },
});
```

### Events (trace)

```typescript
const events = await sb.events.list({ sessionId: "ses_1", limit: 50 });
```

## Error handling

Every non-2xx response throws `SkillBoxError`:

```typescript
import { SkillBoxError } from "@skillbox/sdk";

try {
  await sb.chat({ skillId: "sk_missing", message: "..." });
} catch (err) {
  if (err instanceof SkillBoxError) {
    console.error(err.status);       // 404
    console.error(err.code);         // "SKILL_NOT_FOUND"
    console.error(err.requestId);    // server-side request id for log correlation
  }
}
```

Network failures surface as `SkillBoxError` with `status: 0` and `code: "NETWORK"`; timeouts as `code: "TIMEOUT"`.

## Configuration

```typescript
new SkillBoxClient({
  endpoint: "...",     // required — SkillBox worker URL
  apiKey: "...",       // required
  orgId: "firm_a",     // optional, observability tag
  fetch: myFetch,      // optional, injects custom fetch (tests / edge runtimes)
  timeoutMs: 30_000,   // optional, default 30s. Set 0 to disable.
});
```

## License

MIT. See [LICENSE](./LICENSE).

## Related

- Tech Arch §4 — full SDK design rationale (SkillBox internal doc)
- [Adoptive Co](https://adoptive.co) — consultancy using SkillBox as a delivery tool
