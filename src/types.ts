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

// ─── Resolution ─────────────────────────────────────────────────────────────

export interface ResolvedModel {
  provider: ProviderConfig;
  model: ModelConfig;
}