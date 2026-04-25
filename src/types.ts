export type JsonObject = Record<string, unknown>;

export type BaoBoxClientOptions = {
  /** Full URL to the BaoBox worker, e.g. "https://baobox-nexionops.<subdomain>.workers.dev" */
  endpoint: string;
  /** API key issued by BaoBox admin. Required for `/api/v1/chat`. */
  apiKey?: string;
  /** ADMIN_SECRET bearer token. Required for admin, skills, tools, sessions, and eval APIs. */
  adminSecret?: string;
  /** Optional tag for observability — not sent over the wire yet. */
  orgId?: string;
  /**
   * Optional `fetch` override. Use this in tests to inject a mock, or in
   * edge runtimes that ship a non-global fetch.
   */
  fetch?: typeof globalThis.fetch;
  /** Request timeout in ms. Default 30 000. Set to 0 to disable. */
  timeoutMs?: number;
};

export type ResponseMeta = {
  requestId: string;
  latencyMs: number;
  model?: string;
  trace?: ToolTrace[];
};

export type ToolTrace = {
  toolName: string;
  input: JsonObject;
  output: unknown;
  latencyMs: number;
};

export type DeleteResult = {
  deleted: boolean;
};

// --- Health ---

export type HealthResponse = {
  status: "ok";
  version: string;
  meta: ResponseMeta;
};

// --- Chat ---

export type ChatRequest = {
  skillId?: string;
  message: string;
  sessionId?: string;
  metadata?: JsonObject;
};

export type ChatResponse = {
  response: string;
  usage: { inputTokens: number; outputTokens: number };
  sessionId?: string;
  meta: ResponseMeta;
};

// --- Workflow ---
//
// Single-turn, stateless skill execution. The caller passes the full
// conversation history every call — BaoBox doesn't persist any session
// state for workflow runs. `clientId` and `requestId` are tenant
// correlators that land on `call_logs` so the caller can join workflow
// runs back to their own request log. `runId` is BaoBox-generated and
// is the only handle for retrieving the trace timeline afterwards.

export type WorkflowHistoryRole = "user" | "assistant" | "system";

export type WorkflowHistoryEntry = {
  role: WorkflowHistoryRole;
  content: string;
};

export type WorkflowRequest = {
  /** ID of the skill to invoke (e.g. "sk_email_chase_xxx"). */
  skill: string;
  /** Tenant-side client identifier; persisted on the call_logs row. */
  clientId: string;
  /** Tenant-side request identifier; persisted on call_logs.external_request_id. */
  requestId: string;
  /** The new user input for this turn. */
  input: string;
  /** Optional prior conversation history. Caller is responsible for state. */
  history?: WorkflowHistoryEntry[];
};

export type WorkflowResponse = {
  response: string;
  /** BaoBox-generated run id (`wflow_…`). Use this to fetch the trace. */
  runId: string;
  usage: { inputTokens: number; outputTokens: number };
  meta: ResponseMeta;
};

// --- Sessions ---

export type Session = {
  id: string;
  skillId: string;
  tenantId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SessionCreateRequest = {
  skillId?: string;
};

export type SessionRole = "user" | "assistant" | "system" | "tool";

export type SessionMessage = {
  id: number;
  sessionId: string;
  role: SessionRole;
  content: string;
  tokenCount: number;
  createdAt: string;
};

export type EventType =
  | "user_message"
  | "assistant_message"
  | "system_message"
  | "llm_call_start"
  | "llm_call_end"
  | "tool_call"
  | "tool_result"
  | "error";

// session_id is nullable since BaoBox migration 0017 — workflow events
// only have run_id, not a session. run_id is the workflow correlator.
export type Event = {
  id: string;
  sessionId: string | null;
  requestId: string | null;
  runId: string | null;
  eventType: EventType;
  content: string | null;
  metadata: JsonObject;
  tokenCount: number;
  latencyMs: number;
  parentEventId: string | null;
  createdAt: string;
};

export type SessionTimeline = {
  sessionId: string;
  events: Event[];
};

export type EventListRequest = {
  sessionId: string;
};

// --- Skills ---

export type SkillFileInput = {
  path: string;
  content: string;
};

export type SkillCreateRequest = {
  name: string;
  description?: string;
  systemPrompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  sourceUrl?: string;
  files?: SkillFileInput[];
  /**
   * SDK convenience field. The backend manages these via `/tools/skills/...`;
   * the client will reconcile attachments after create/update.
   */
  tools?: string[];
};

export type SkillUpdateRequest = Partial<SkillCreateRequest>;

export type SkillUpsertRequest = SkillCreateRequest & {
  id?: string;
};

export type Skill = {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  model: string;
  temperature: number;
  maxTokens: number;
  sourceUrl: string | null;
  tenantId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SkillFileSummary = {
  path: string;
  size: number;
  updatedAt: string;
};

export type SkillFileReference = {
  path: string;
  size: number;
};

export type SkillWithFiles = Skill & {
  files: SkillFileReference[];
};

export type SkillImportRequest = {
  url: string;
  name?: string;
};

export type SkillFile = {
  id: string;
  skillId: string;
  path: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type SetSkillFileRequest = {
  content: string;
};

export type SetSkillFileResult = {
  path: string;
  updated: boolean;
};

// --- Tools ---

export type ToolHandlerType = "builtin" | "http";

export type ToolCreateRequest = {
  name: string;
  description: string;
  inputSchema: JsonObject;
  handlerType: ToolHandlerType;
  handlerConfig: JsonObject;
};

export type ToolUpsertRequest = ToolCreateRequest;

export type Tool = {
  id: string;
  name: string;
  description: string;
  inputSchema: string;
  handlerType: ToolHandlerType;
  handlerConfig: string;
  createdAt: string;
};

export type AttachToolResult = {
  attached: boolean;
};

export type DetachToolResult = {
  detached: boolean;
};

export type SkillSecretSummary = {
  id: string;
  key: string;
  createdAt: string;
};

export type SetSkillSecretRequest = {
  key: string;
  value: string;
};

export type SetSkillSecretResult = {
  key: string;
  set: boolean;
};

// --- Admin ---

export type CreateApiKeyRequest = {
  name: string;
  permissions?: string[];
  rateLimit?: number;
  expiresAt?: string;
};

export type ApiKey = {
  apiKeyId: string;
  name: string;
  permissions: string;
  rateLimit: number;
  tenantId: string | null;
  createdAt: string;
  expiresAt: string | null;
};

export type CreatedApiKey = {
  id: string;
  key: string;
  name: string;
  tenantId: string;
};

export type AdminStats = Record<string, unknown>;
export type CallLogRow = Record<string, unknown>;

export type ScheduledTask = {
  id: string;
  name: string;
  skillId: string;
  prompt: string;
  telegramChatId: number | null;
  schedule: string;
  enabled: number;
  createdAt: string;
  lastRunAt: string | null;
};

export type CreateScheduledTaskRequest = {
  name: string;
  skillId: string;
  prompt: string;
  telegramChatId?: number;
  schedule?: string;
};

export type UpdateScheduledTaskRequest = {
  enabled?: boolean;
  schedule?: string;
  prompt?: string;
};

// --- Eval ---

export type EvalCase = {
  id: string;
  skillId: string;
  name: string;
  input: string;
  expectedBehavior: string;
  dimensions: string;
  passingThreshold: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateEvalCaseRequest = {
  name: string;
  input: string;
  expectedBehavior: string;
  dimensions?: string[];
  passingThreshold?: number;
};

export type RunEvalRequest = {
  skillId: string;
  testCaseIds?: string[];
  promptVersion?: string;
};

export type EvalRunResultSummary = {
  testCaseId: string;
  status: string;
  score: number | null;
  scores: unknown;
  response: string | null;
  reasoning: string | null;
};

export type EvalRunExecution = {
  runId: string;
  status: string;
  totalCases: number;
  passed: number;
  failed: number;
  avgScore: number | null;
  results: EvalRunResultSummary[];
  durationMs: number;
};

export type EvalRun = {
  id: string;
  skillId: string;
  promptVersion: string | null;
  status: string;
  totalCases: number;
  passed: number;
  failed: number;
  avgScore: number | null;
  metadata: string;
  createdAt: string;
  completedAt: string | null;
};

export type EvalRunResult = {
  id: string;
  runId: string;
  testCaseId: string;
  sessionId: string | null;
  status: string;
  score: number | null;
  scoresJson: string | null;
  response: string | null;
  reasoning: string | null;
  latencyMs: number;
  /**
   * Frozen pre-LLM input snapshot from BaoBox migration 0018 —
   * `{ messages, tools_snapshot, options, secrets_keys }` serialized as JSON.
   * `secrets_keys` contains key NAMES only, never values. Null when the
   * eval execution errored before reaching the LLM call.
   */
  llmInputJson: string | null;
  createdAt: string;
};

export type EvalRunWithResults = EvalRun & {
  results: EvalRunResult[];
};

export type EvalStatsRequest = {
  skillId?: string;
  since?: string;
};

export type EvalStats = {
  skillId: string;
  period: { since: string };
  summary:
    | {
        total: number;
        avgScore: number;
        distribution: Record<string, number>;
      }
    | null;
  trend: Record<string, unknown>[];
};

export type EvalFailuresRequest = {
  skillId?: string;
  threshold?: number;
  limit?: number;
};

export type EvalFailureRow = Record<string, unknown>;

export type EvalCompareRequest = {
  skillId: string;
  a: string;
  b: string;
};

export type EvalCompare = {
  skillId: string;
  versionA: {
    label: string;
    dimensions: Record<string, unknown>[];
  };
  versionB: {
    label: string;
    dimensions: Record<string, unknown>[];
  };
};
