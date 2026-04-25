import { describe, expect, it, vi } from "vitest";
import { BaoBoxClient, BaoBoxError } from "../src/index.js";

function fakeFetch(handler: (url: string, init: RequestInit) => Response) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    return handler(url, init ?? {});
  }) as unknown as typeof globalThis.fetch;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("BaoBoxClient constructor", () => {
  it("rejects missing endpoint", () => {
    expect(
      () => new BaoBoxClient({ endpoint: "", apiKey: "k" }),
    ).toThrowError(/endpoint required/);
  });

  it("rejects missing credentials", () => {
    expect(
      () => new BaoBoxClient({ endpoint: "https://x" }),
    ).toThrowError(/apiKey or adminSecret required/);
  });

  it("strips trailing slash from endpoint", async () => {
    const calls: string[] = [];
    const fetch = fakeFetch((url) => {
      calls.push(url);
      return jsonResponse(200, {
        data: { response: "ok", usage: { input_tokens: 1, output_tokens: 2 } },
        metadata: { request_id: "r_1", latency_ms: 5 },
      });
    });
    const bb = new BaoBoxClient({
      endpoint: "https://baobox-jv1.example.com/",
      apiKey: "k",
      fetch,
    });
    await bb.chat({ message: "hi" });
    expect(calls[0]).toBe("https://baobox-jv1.example.com/api/v1/chat");
  });
});

describe("health", () => {
  it("calls health without authorization header", async () => {
    let seenAuth: string | null = "missing";
    const fetch = fakeFetch((_url, init) => {
      seenAuth = (init.headers as Record<string, string> | undefined)?.authorization ?? null;
      return jsonResponse(200, {
        data: { status: "ok", version: "0.1.0" },
        metadata: { request_id: "r_health", latency_ms: 1 },
      });
    });

    const bb = new BaoBoxClient({
      endpoint: "https://api.example.com",
      adminSecret: "adm",
      fetch,
    });

    const res = await bb.health.get();
    expect(seenAuth).toBeNull();
    expect(res.status).toBe("ok");
    expect(res.version).toBe("0.1.0");
    expect(res.meta.requestId).toBe("r_health");
  });
});

describe("chat", () => {
  it("sends snake_case body, returns camelCase response", async () => {
    const seen: { url?: string; body?: unknown; auth?: string } = {};
    const fetch = fakeFetch((url, init) => {
      seen.url = url;
      seen.body = JSON.parse(String(init.body));
      seen.auth = (init.headers as Record<string, string>).authorization;
      return jsonResponse(200, {
        data: {
          response: "chased",
          usage: { input_tokens: 10, output_tokens: 20 },
          session_id: "ses_new",
        },
        metadata: {
          request_id: "r_42",
          latency_ms: 350,
          model: "minimax",
          trace: [
            {
              tool_name: "lookup_client_docs",
              input: { client_id: "cli_01" },
              output: { missing: ["bank_statement"] },
              latency_ms: 42,
            },
          ],
        },
      });
    });

    const bb = new BaoBoxClient({
      endpoint: "https://api.example.com",
      apiKey: "sk-123",
      fetch,
    });

    const r = await bb.chat({
      skillId: "sk_chase",
      message: "chase cli_01",
      sessionId: "ses_1",
      metadata: { source: "kanban" },
    });

    expect(seen.url).toBe("https://api.example.com/api/v1/chat");
    expect(seen.auth).toBe("Bearer sk-123");
    expect(seen.body).toEqual({
      skill_id: "sk_chase",
      message: "chase cli_01",
      session_id: "ses_1",
      metadata: { source: "kanban" },
    });
    expect(r.response).toBe("chased");
    expect(r.usage).toEqual({ inputTokens: 10, outputTokens: 20 });
    expect(r.sessionId).toBe("ses_new");
    expect(r.meta.requestId).toBe("r_42");
    expect(r.meta.latencyMs).toBe(350);
    expect(r.meta.trace?.[0]).toEqual({
      toolName: "lookup_client_docs",
      input: { client_id: "cli_01" },
      output: { missing: ["bank_statement"] },
      latencyMs: 42,
    });
  });

  it("throws early when apiKey is missing", async () => {
    const bb = new BaoBoxClient({
      endpoint: "https://api.example.com",
      adminSecret: "adm",
      fetch: fakeFetch(() => {
        throw new Error("should not reach fetch");
      }),
    });

    await expect(bb.chat({ message: "hi" })).rejects.toThrow(/apiKey required/);
  });

  it("throws BaoBoxError with parsed code/message/request_id on 4xx", async () => {
    const fetch = fakeFetch(() =>
      jsonResponse(401, {
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid API key",
          request_id: "r_bad",
        },
      }),
    );
    const bb = new BaoBoxClient({
      endpoint: "https://api.example.com",
      apiKey: "wrong",
      fetch,
    });
    try {
      await bb.chat({ message: "hi" });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(BaoBoxError);
      const e = err as BaoBoxError;
      expect(e.status).toBe(401);
      expect(e.code).toBe("UNAUTHORIZED");
      expect(e.message).toBe("Invalid API key");
      expect(e.requestId).toBe("r_bad");
    }
  });
});

describe("admin auth surfaces", () => {
  it("uses adminSecret for skills.list", async () => {
    const seen: { url?: string; auth?: string } = {};
    const fetch = fakeFetch((url, init) => {
      seen.url = url;
      seen.auth = (init.headers as Record<string, string>).authorization;
      return jsonResponse(200, {
        data: [
          {
            id: "sk_1",
            name: "Chaser",
            description: "desc",
            system_prompt: "prompt",
            model: "MiniMax-M2.7",
            temperature: 0.2,
            max_tokens: 4096,
            source_url: null,
            tenant_id: "t_1",
            created_at: "2026-04-23T00:00:00Z",
            updated_at: "2026-04-23T00:00:00Z",
          },
        ],
        metadata: { request_id: "r_skill", latency_ms: 5 },
      });
    });

    const bb = new BaoBoxClient({
      endpoint: "https://api.example.com",
      adminSecret: "adm-secret",
      fetch,
    });

    const skills = await bb.skills.list();
    expect(seen.url).toBe("https://api.example.com/api/v1/skills");
    expect(seen.auth).toBe("Bearer adm-secret");
    expect(skills[0]?.systemPrompt).toBe("prompt");
    expect(skills[0]?.sourceUrl).toBeNull();
  });

  it("events.list hits session timeline and unwraps the nested response", async () => {
    let seenUrl = "";
    const fetch = fakeFetch((url) => {
      seenUrl = url;
      return jsonResponse(200, {
        data: {
          session_id: "ses/1",
          events: [
            {
              id: "evt_1",
              session_id: "ses/1",
              request_id: "r_1",
              run_id: null,
              event_type: "tool_result",
              content: null,
              metadata: "{\"ok\":true}",
              token_count: 0,
              latency_ms: 9,
              parent_event_id: null,
              created_at: "2026-04-23T00:00:00Z",
            },
          ],
        },
        metadata: { request_id: "r_tl", latency_ms: 1 },
      });
    });

    const bb = new BaoBoxClient({
      endpoint: "https://api.example.com",
      adminSecret: "adm",
      fetch,
    });

    const events = await bb.events.list({ sessionId: "ses/1" });
    expect(seenUrl).toBe("https://api.example.com/api/v1/sessions/ses%2F1/timeline");
    expect(events).toEqual([
      {
        id: "evt_1",
        sessionId: "ses/1",
        requestId: "r_1",
        runId: null,
        eventType: "tool_result",
        content: null,
        metadata: { ok: true },
        tokenCount: 0,
        latencyMs: 9,
        parentEventId: null,
        createdAt: "2026-04-23T00:00:00Z",
      },
    ]);
  });

  it("keeps old admin.skills.upsert working and syncs tool attachments", async () => {
    const calls: Array<{ method: string; url: string }> = [];
    const fetch = fakeFetch((url, init) => {
      const method = init.method ?? "GET";
      calls.push({ method, url });

      if (method === "PUT" && url === "https://api.example.com/api/v1/skills/sk_1") {
        return jsonResponse(200, {
          data: {
            id: "sk_1",
            name: "Chaser",
            description: "desc",
            system_prompt: "prompt",
            model: "MiniMax-M2.7",
            temperature: 0.2,
            max_tokens: 4096,
            source_url: null,
            tenant_id: null,
            created_at: "2026-04-23T00:00:00Z",
            updated_at: "2026-04-23T00:00:00Z",
          },
          metadata: { request_id: "r_skill", latency_ms: 1 },
        });
      }

      if (method === "GET" && url === "https://api.example.com/api/v1/tools/skills/sk_1/tools") {
        return jsonResponse(200, {
          data: [
            {
              id: "tool_old",
              name: "Old Tool",
              description: "desc",
              input_schema: "{}",
              handler_type: "builtin",
              handler_config: "{}",
              created_at: "2026-04-23T00:00:00Z",
            },
          ],
          metadata: { request_id: "r_tools", latency_ms: 1 },
        });
      }

      if (
        method === "DELETE" &&
        url === "https://api.example.com/api/v1/tools/skills/sk_1/tools/tool_old"
      ) {
        return jsonResponse(200, {
          data: { detached: true },
          metadata: { request_id: "r_detach", latency_ms: 0 },
        });
      }

      if (
        method === "POST" &&
        url === "https://api.example.com/api/v1/tools/skills/sk_1/tools/tool_new"
      ) {
        return jsonResponse(200, {
          data: { attached: true },
          metadata: { request_id: "r_attach", latency_ms: 0 },
        });
      }

      throw new Error(`Unexpected call: ${method} ${url}`);
    });

    const bb = new BaoBoxClient({
      endpoint: "https://api.example.com",
      adminSecret: "adm",
      fetch,
    });

    const skill = await bb.admin.skills.upsert({
      id: "sk_1",
      name: "Chaser",
      systemPrompt: "prompt",
      tools: ["tool_new"],
    });

    expect(skill.id).toBe("sk_1");
    expect(calls).toEqual([
      { method: "PUT", url: "https://api.example.com/api/v1/skills/sk_1" },
      { method: "GET", url: "https://api.example.com/api/v1/tools/skills/sk_1/tools" },
      {
        method: "DELETE",
        url: "https://api.example.com/api/v1/tools/skills/sk_1/tools/tool_old",
      },
      {
        method: "POST",
        url: "https://api.example.com/api/v1/tools/skills/sk_1/tools/tool_new",
      },
    ]);
  });

  it("keeps old admin.tools.upsert working against /api/v1/tools", async () => {
    let seenUrl = "";
    let seenMethod = "";
    const fetch = fakeFetch((url, init) => {
      seenUrl = url;
      seenMethod = init.method ?? "GET";
      return jsonResponse(201, {
        data: {
          id: "tool_1",
          name: "lookup",
          description: "desc",
          input_schema: "{\"type\":\"object\"}",
          handler_type: "http",
          handler_config: "{\"url\":\"https://example.com\"}",
          created_at: "2026-04-23T00:00:00Z",
        },
        metadata: { request_id: "r_tool", latency_ms: 1 },
      });
    });

    const bb = new BaoBoxClient({
      endpoint: "https://api.example.com",
      adminSecret: "adm",
      fetch,
    });

    const tool = await bb.admin.tools.upsert({
      name: "lookup",
      description: "desc",
      inputSchema: { type: "object" },
      handlerType: "http",
      handlerConfig: { url: "https://example.com" },
    });

    expect(seenMethod).toBe("POST");
    expect(seenUrl).toBe("https://api.example.com/api/v1/tools");
    expect(tool.handlerType).toBe("http");
  });
});

describe("admin and eval helpers", () => {
  it("creates API keys and maps tenant_id", async () => {
    let seenAuth = "";
    const fetch = fakeFetch((_url, init) => {
      seenAuth = (init.headers as Record<string, string>).authorization ?? "";
      return jsonResponse(201, {
        data: {
          id: "key_1",
          key: "skb_raw",
          name: "demo",
          tenant_id: "t_default",
        },
        metadata: { request_id: "r_key", latency_ms: 0 },
      });
    });

    const bb = new BaoBoxClient({
      endpoint: "https://api.example.com",
      adminSecret: "adm",
      fetch,
    });

    const key = await bb.admin.keys.create({ name: "demo" });
    expect(seenAuth).toBe("Bearer adm");
    expect(key).toEqual({
      id: "key_1",
      key: "skb_raw",
      name: "demo",
      tenantId: "t_default",
    });
  });

  it("encodes eval.compare query params", async () => {
    let seenUrl = "";
    const fetch = fakeFetch((url) => {
      seenUrl = url;
      return jsonResponse(200, {
        data: {
          skill_id: "sk/1",
          version_a: { label: "A", dimensions: [{ score: 3 }] },
          version_b: { label: "B", dimensions: [{ score: 4 }] },
        },
        metadata: { request_id: "r_cmp", latency_ms: 0 },
      });
    });

    const bb = new BaoBoxClient({
      endpoint: "https://api.example.com",
      adminSecret: "adm",
      fetch,
    });

    const result = await bb.eval.compare({ skillId: "sk/1", a: "v 1", b: "v/2" });
    expect(seenUrl).toBe(
      "https://api.example.com/api/v1/eval/compare?skill_id=sk%2F1&a=v+1&b=v%2F2",
    );
    expect(result.skillId).toBe("sk/1");
    expect(result.versionA.label).toBe("A");
    expect(result.versionB.label).toBe("B");
  });
});

describe("workflow", () => {
  it("sends snake_case body, returns camelCase response with runId", async () => {
    const seen: { url?: string; body?: unknown; auth?: string } = {};
    const fetch = fakeFetch((url, init) => {
      seen.url = url;
      seen.body = JSON.parse(String(init.body));
      seen.auth = (init.headers as Record<string, string>).authorization;
      return jsonResponse(200, {
        data: {
          response: "drafted",
          run_id: "wflow_abc123",
          usage: { input_tokens: 50, output_tokens: 25 },
        },
        metadata: { request_id: "r_wf", latency_ms: 320, model: "MiniMax-M2.7" },
      });
    });

    const bb = new BaoBoxClient({
      endpoint: "https://api.example.com",
      apiKey: "skb-wf",
      fetch,
    });

    const r = await bb.workflow({
      skill: "sk_email_chase",
      clientId: "client_abc",
      requestId: "nexionops_req_42",
      input: "chase client for missing bank statements",
      history: [
        { role: "user", content: "draft an email" },
        { role: "assistant", content: "Sure, here's the draft..." },
      ],
    });

    expect(seen.url).toBe("https://api.example.com/api/v1/workflow");
    expect(seen.auth).toBe("Bearer skb-wf");
    expect(seen.body).toEqual({
      skill: "sk_email_chase",
      client_id: "client_abc",
      request_id: "nexionops_req_42",
      input: "chase client for missing bank statements",
      history: [
        { role: "user", content: "draft an email" },
        { role: "assistant", content: "Sure, here's the draft..." },
      ],
    });
    expect(r.response).toBe("drafted");
    expect(r.runId).toBe("wflow_abc123");
    expect(r.usage).toEqual({ inputTokens: 50, outputTokens: 25 });
    expect(r.meta.requestId).toBe("r_wf");
  });

  it("omits history when not provided", async () => {
    let seenBody: Record<string, unknown> = {};
    const fetch = fakeFetch((_url, init) => {
      seenBody = JSON.parse(String(init.body));
      return jsonResponse(200, {
        data: {
          response: "ok",
          run_id: "wflow_def",
          usage: { input_tokens: 1, output_tokens: 1 },
        },
        metadata: { request_id: "r_wf2", latency_ms: 10 },
      });
    });
    const bb = new BaoBoxClient({
      endpoint: "https://api.example.com",
      apiKey: "k",
      fetch,
    });
    await bb.workflow({
      skill: "sk_x",
      clientId: "c",
      requestId: "rq",
      input: "hi",
    });
    expect("history" in seenBody).toBe(false);
  });

  it("propagates 404 from BaoBox as BaoBoxError", async () => {
    const fetch = fakeFetch(() =>
      jsonResponse(404, {
        error: { code: "NOT_FOUND", message: "Skill 'sk_missing' not found", request_id: "r_x" },
      }),
    );
    const bb = new BaoBoxClient({
      endpoint: "https://api.example.com",
      apiKey: "k",
      fetch,
    });
    await expect(
      bb.workflow({
        skill: "sk_missing",
        clientId: "c",
        requestId: "rq",
        input: "hi",
      }),
    ).rejects.toBeInstanceOf(BaoBoxError);
  });
});

describe("timeout", () => {
  it("aborts after timeoutMs and throws TIMEOUT error", async () => {
    const fetch: typeof globalThis.fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new DOMException("aborted", "AbortError");
          reject(err);
        });
      });
    const bb = new BaoBoxClient({
      endpoint: "https://api.example.com",
      apiKey: "k",
      fetch,
      timeoutMs: 10,
    });
    try {
      await bb.chat({ message: "hi" });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(BaoBoxError);
      expect((err as BaoBoxError).code).toBe("TIMEOUT");
    }
  });
});
