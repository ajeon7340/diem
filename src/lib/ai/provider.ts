import 'server-only';

/**
 * One structured-output call, three providers.
 *
 * Every model call in this product is the same shape: a system prompt, a block
 * of text, and a JSON result whose schema is fixed. That is the only thing the
 * app needs, so it is the only thing this exposes — swapping providers must
 * not mean rewriting three call sites, and it must not mean each of them
 * drifting into its own idea of what a failure looks like.
 *
 *   ADFIT_AI_PROVIDER  'anthropic' (default) | 'gemini' | 'local'
 *   ADFIT_AI_MODEL     overrides the provider's default model id
 *   GEMINI_API_KEY     required for gemini
 *   ANTHROPIC_API_KEY  required for anthropic
 *   ADFIT_AI_BASE_URL  OpenAI-compatible endpoint for 'local'
 *   ADFIT_AI_API_KEY   sent as a bearer token to 'local' when the server wants one
 *
 * 'local' EXISTS SO NOTHING HERE FORCES A BILL. Both other providers are
 * metered, and adding a feature that quietly requires one is how a project
 * acquires a dependency nobody chose. It speaks the OpenAI chat-completions
 * shape, which llama.cpp, Ollama, vLLM, LM Studio and every other local runner
 * serves, so a deployment can run every model pass in this product on a box it
 * already owns with no account anywhere. Quality is the operator's business;
 * the schema validation and the citation checks downstream are identical either
 * way, which is the point of doing those downstream.
 *
 * Gemini is called over REST rather than through an SDK. The request shape for
 * `generateContent` with a `responseSchema` is stable and public; an SDK
 * version whose method names I would have to guess is not, and a wrong guess
 * compiles and then fails at runtime with the key already spent.
 *
 * WHAT THIS DOES NOT COVER: the press pass. `scripts/opinion-press.ts` uses a
 * SERVER-SIDE web search tool, and the two providers implement that
 * differently — Anthropic runs a search tool, Gemini grounds with Google
 * Search and returns its own citation metadata. Sharing one wrapper across
 * them would mean pretending two different evidence trails are the same
 * evidence trail, and the whole point of that pass is that every claim is
 * traceable to a source. It stays provider-specific and says so.
 */

export type AiProvider = 'anthropic' | 'gemini' | 'local';

const DEFAULT_MODEL: Record<AiProvider, string> = {
  anthropic: 'claude-opus-5',
  // Deliberately not pinned to a version I cannot verify. Set ADFIT_AI_MODEL
  // to the exact id from Google's model list; this default is the family name
  // and will be rejected with a clear 404 rather than silently billing for
  // something other than what was asked for.
  gemini: 'gemini-3-pro',
  // Whatever the operator pulled. Named rather than guessed, for the same
  // reason as gemini above: a wrong default 404s against a server that is
  // otherwise working, and the error points at this file instead of at the
  // configuration.
  local: 'llama3.1',
};

export function aiProvider(): AiProvider {
  const configured = process.env.ADFIT_AI_PROVIDER;
  if (configured === 'gemini') return 'gemini';
  if (configured === 'local') return 'local';
  return 'anthropic';
}

/** Default matches Ollama's OpenAI-compatible endpoint, the common case. */
export function aiBaseUrl(): string {
  return process.env.ADFIT_AI_BASE_URL?.replace(/\/$/, '') || 'http://127.0.0.1:11434/v1';
}

/**
 * Whether a model call can be made at all.
 *
 * Asked before a gated feature offers itself, so a deployment with the approval
 * configured and no provider reachable says "no suggestion source is
 * configured" instead of failing mid-run.
 */
export function aiConfigured(): boolean {
  switch (aiProvider()) {
    case 'gemini':
      return Boolean(process.env.GEMINI_API_KEY);
    case 'local':
      return Boolean(process.env.ADFIT_AI_BASE_URL);
    default:
      return Boolean(process.env.ANTHROPIC_API_KEY);
  }
}

export function aiModel(): string {
  return process.env.ADFIT_AI_MODEL || DEFAULT_MODEL[aiProvider()];
}

/** Token counts as the provider reported them, not as we estimated them. */
export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  model: string;
  provider: AiProvider;
}

export interface AiResult<T> {
  data: T;
  usage: AiUsage;
}

export class AiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly provider: AiProvider,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

/**
 * A JSON Schema for the result. Kept as plain JSON Schema because that is what
 * both providers take — converting a zod schema at each call site is where the
 * two would drift apart.
 */
export interface StructuredRequest {
  system: string;
  /**
   * A prefix of the user message that repeats across calls, kept separate so
   * it can be cached.
   *
   * One creator is read against many briefs by the same agency and this half
   * is identical every time; the brief goes in `user`, after the cache
   * breakpoint, so the second read pays for the brief alone. Anthropic marks
   * it with cache_control. Gemini has no per-request breakpoint, so it is
   * simply concatenated — correct output either way, and only the bill
   * differs, which is the right way round for a difference between providers.
   */
  cachedUser?: string;
  user: string;
  schema: Record<string, unknown>;
  /** Named for the provider that wants a tool name. Ignored by Gemini. */
  toolName: string;
  maxTokens: number;
}

export async function generateStructured<T>(request: StructuredRequest): Promise<AiResult<T>> {
  switch (aiProvider()) {
    case 'gemini':
      return viaGemini<T>(request);
    case 'local':
      return viaLocal<T>(request);
    default:
      return viaAnthropic<T>(request);
  }
}

// ---------------------------------------------------------------------------
// Local, OpenAI-compatible
// ---------------------------------------------------------------------------

/**
 * One POST to /chat/completions with a JSON-schema response format.
 *
 * `strict: true` is sent because the servers that honour it produce
 * schema-valid output and the ones that do not ignore the field — there is no
 * version of this request that is worse for having asked. Output is parsed
 * against the caller's zod schema regardless: a local model is likelier than a
 * hosted one to return prose around the JSON, and every caller in this codebase
 * already treats model output as untrusted.
 */
async function viaLocal<T>({
  system,
  cachedUser,
  user,
  schema,
  toolName,
  maxTokens,
}: StructuredRequest): Promise<AiResult<T>> {
  const base = aiBaseUrl();
  const model = aiModel();
  const key = process.env.ADFIT_AI_API_KEY;

  let res: Response;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(key ? { authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: cachedUser ? `${cachedUser}\n\n${user}` : user },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: toolName, schema, strict: true },
        },
      }),
    });
  } catch (err) {
    // A local server that is not running is the most likely failure by far, and
    // "fetch failed" sends whoever reads it looking at the network.
    throw new AiError(
      `could not reach the local model server at ${base} — is it running? (${err instanceof Error ? err.message : String(err)})`,
      null,
      'local',
    );
  }

  if (!res.ok) {
    throw new AiError(`${res.status} ${(await res.text()).slice(0, 300)}`, res.status, 'local');
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const choice = json.choices?.[0];
  const text = choice?.message?.content ?? '';
  if (!text) {
    throw new AiError(
      `empty response (finish_reason: ${choice?.finish_reason ?? 'unknown'})`,
      null,
      'local',
    );
  }

  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    // Some local servers wrap JSON in a fenced block however it was asked for.
    // One salvage attempt, then the same honest error as everywhere else.
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const inner = fenced?.[1] ?? text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    try {
      data = JSON.parse(inner) as T;
    } catch {
      throw new AiError(
        choice?.finish_reason === 'length'
          ? `the answer was cut off at max_tokens (${maxTokens}) — raise the budget`
          : 'the answer was not valid JSON',
        null,
        'local',
      );
    }
  }

  return {
    data,
    usage: {
      inputTokens: json.usage?.prompt_tokens ?? 0,
      outputTokens: json.usage?.completion_tokens ?? 0,
      model,
      provider: 'local',
    },
  };
}

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------

/**
 * Gemini rejects several JSON Schema keywords that Anthropic accepts, and a
 * rejected schema is a 400 with the key already authenticated — cheap, but a
 * confusing failure at 3am. Strip what it does not take rather than asking
 * every call site to write two schemas.
 */
function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (key === 'additionalProperties' || key === '$schema' || key === 'default') continue;
    out[key] = toGeminiSchema(value);
  }
  return out;
}

async function viaGemini<T>({
  system,
  cachedUser,
  user,
  schema,
  maxTokens,
}: StructuredRequest): Promise<AiResult<T>> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AiError('GEMINI_API_KEY is not set', null, 'gemini');
  const model = aiModel();

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [
          { role: 'user', parts: cachedUser ? [{ text: cachedUser }, { text: user }] : [{ text: user }] },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: toGeminiSchema(schema),
          maxOutputTokens: maxTokens,
        },
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new AiError(`${res.status} ${body.slice(0, 300)}`, res.status, 'gemini');
  }

  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };

  const candidate = json.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text) {
    // A truncated response is not an empty one, and silently returning {} here
    // would read downstream as "nothing found" — the same absence-as-zero bug
    // this codebase keeps finding. Say which it was.
    throw new AiError(
      `empty response (finishReason: ${candidate?.finishReason ?? 'unknown'})`,
      null,
      'gemini',
    );
  }

  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    // A truncated answer is not a malformed one, and reporting it as
    // "Unexpected end of JSON input" sends whoever reads the log looking at
    // the schema instead of at the budget. `finishReason` already says which
    // it was; the caller should not have to guess.
    const why = candidate?.finishReason ?? 'unknown';
    throw new AiError(
      why === 'MAX_TOKENS'
        ? `the answer was cut off at maxOutputTokens (${maxTokens}) — raise the budget`
        : `the answer was not valid JSON (finishReason: ${why})`,
      null,
      'gemini',
    );
  }

  return {
    data,
    usage: {
      inputTokens: json.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
      model,
      provider: 'gemini',
    },
  };
}

// ---------------------------------------------------------------------------
// Anthropic
// ---------------------------------------------------------------------------

async function viaAnthropic<T>({
  system,
  cachedUser,
  user,
  schema,
  toolName,
  maxTokens,
}: StructuredRequest): Promise<AiResult<T>> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new AiError('ANTHROPIC_API_KEY is not set', null, 'anthropic');
  const model = aiModel();

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: key });

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    // Cached: the system prompt is identical on every call of a batch run, and
    // it is the larger half of a short classification request.
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    tools: [{ name: toolName, description: 'Record the result.', input_schema: schema as never }],
    tool_choice: { type: 'tool', name: toolName },
    messages: [
      {
        role: 'user',
        content: cachedUser
          ? [
              { type: 'text' as const, text: cachedUser, cache_control: { type: 'ephemeral' as const } },
              { type: 'text' as const, text: user },
            ]
          : user,
      },
    ],
  });

  const call = response.content.find((b) => b.type === 'tool_use' && b.name === toolName);
  if (!call || call.type !== 'tool_use') {
    throw new AiError(`no ${toolName} call in the response`, null, 'anthropic');
  }

  return {
    data: call.input as T,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      model,
      provider: 'anthropic',
    },
  };
}

/**
 * What the configured key can actually call.
 *
 * A 404 from `generateStructured` says the model id is wrong and says nothing
 * about which ids are right — and guessing at version numbers against a billed
 * endpoint is how a run costs money to discover a typo. This asks.
 */
export async function listModels(): Promise<{ id: string; methods: string[] }[]> {
  if (aiProvider() !== 'gemini') throw new AiError('listModels is gemini-only', null, aiProvider());
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AiError('GEMINI_API_KEY is not set', null, 'gemini');

  const out: { id: string; methods: string[] }[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL('https://generativelanguage.googleapis.com/v1beta/models');
    url.searchParams.set('pageSize', '200');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await fetch(url, { headers: { 'x-goog-api-key': key } });
    if (!res.ok) {
      throw new AiError(`${res.status} ${(await res.text()).slice(0, 200)}`, res.status, 'gemini');
    }
    const json = (await res.json()) as {
      models?: { name?: string; supportedGenerationMethods?: string[] }[];
      nextPageToken?: string;
    };
    for (const m of json.models ?? []) {
      out.push({
        id: (m.name ?? '').replace(/^models\//, ''),
        methods: m.supportedGenerationMethods ?? [],
      });
    }
    pageToken = json.nextPageToken;
  } while (pageToken);
  return out;
}
