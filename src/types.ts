// ─── Configuration Types ────────────────────────────────────────────────────

export interface ModelConfig {
  /** The actual model ID sent to the upstream API */
  readonly id: string;
  /** The alias exposed via the Ollama-compatible interface */
  readonly alias: string;
  readonly supportsVision: boolean;
  readonly supportsTools: boolean;
  readonly supportsReasoning: boolean;
  readonly defaultReasoningEffort?: ReasoningEffort;
  readonly contextLength?: number
}

export interface ProviderConfig {
  readonly name: string;
  readonly baseURL: string;
  readonly apiKey: string;
  readonly defaultHeaders?: Readonly<Record<string, string>>;
  readonly models: readonly ModelConfig[];
}

export interface AppConfig {
  readonly host: string;
  readonly port: number;
  readonly providers: readonly ProviderConfig[];
}

// ─── Reasoning ──────────────────────────────────────────────────────────────

export type ReasoningEffort = "low" | "medium" | "high";

// ─── Ollama API Types ───────────────────────────────────────────────────────

export interface OllamaModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    parent_model: string;
    format: string;
    family: string;
    families: string[] | null;
    parameter_size: string;
    quantization_level: string;
  };
}

export interface OllamaListResponse {
  models: OllamaModel[];
}

/** Ollama-format message content can be a string or structured parts */
export interface OllamaMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  images?: string[];
  tool_calls?: OllamaToolCall[];
  thinking?: string;
}

export interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

export interface OllamaTool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface OllamaChatRequest {
  model: string;
  messages: OllamaMessage[];
  stream?: boolean;
  format?: string | Record<string, unknown>;
  options?: Record<string, unknown>;
  tools?: OllamaTool[];
  think?: boolean;
  /** Custom extension: reasoning_effort */
  reasoning_effort?: ReasoningEffort;
  keep_alive?: string | number;
}

export interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: OllamaMessage;
  done: boolean;
  done_reason?: string;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

// ─── Resolution ─────────────────────────────────────────────────────────────

export interface ResolvedModel {
  provider: ProviderConfig;
  model: ModelConfig;
}