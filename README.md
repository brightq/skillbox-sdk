# @skillbox/sdk

TypeScript SDK for [SkillBox](https://skillbox.au) — an AI integration tool for AI adoption projects.

SkillBox is a closed-source product that provides an Agent runtime + eval + observability. This SDK is a thin HTTP client for calling SkillBox from your application.

## Status

**Pre-release scaffold.** No implementation yet. Planned v0.1 ships:

- `SkillBoxClient.chat(...)` — core chat endpoint
- `SkillBoxClient.admin.skills.upsert(...)` — sync skill config
- `SkillBoxClient.events.list(...)` — query event log
- TypeScript types for all request/response shapes

See `BQ Knowledge Base/projects/Skill Box/Technical Architecture - Delivery Topology.md` § 4 for full SDK interface design.

## Installation (planned)

```bash
pnpm add @skillbox/sdk
# or
npm install @skillbox/sdk
```

## Usage (planned)

```typescript
import { SkillBoxClient } from '@skillbox/sdk';

const sb = new SkillBoxClient({
  endpoint: 'https://skillbox-jv1.skillbox.au',
  apiKey: process.env.SKILLBOX_API_KEY!,
  orgId: 'firm_a',
});

const res = await sb.chat({
  skillId: 'sk_chase_client',
  message: 'Please chase client 123 for missing docs',
  sessionId: 'session_client_123',
});

console.log(res.data.response);
```

## Design Philosophy

This SDK is an **HTTP client**, not a runtime. It has zero business logic — all intelligence lives in SkillBox's hosted runtime. The SDK just wraps auth + request/response serialization + types.

**Why public / open source**: The SDK has no IP value (it's 200 lines of HTTP wrapping). Making it public removes friction for partners and third-party users while keeping the SkillBox runtime (where the real IP is) closed.

## License

MIT

## Related

- SkillBox homepage: https://skillbox.au *(pending)*
- SkillBox product docs: *(pending)*
- Adoptive Co (the consultancy that uses SkillBox as a delivery tool): https://adoptive.co
