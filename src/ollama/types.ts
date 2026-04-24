/** Ollama 的 options（截取常用的一部分；其余透传忽略） */
export interface OllamaOptions {
  temperature?: number;
  top_p?: number;
  top_k?: number;
  num_predict?: number;
  stop?: string | string[];
  seed?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  num_ctx?: number;
  repeat_penalty?: number;
  [k: string]: unknown;
}

export interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown> | string;
  };
}

export interface OllamaChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** base64 编码的图片（无 data: 前缀） */
  images?: string[];
  tool_calls?: OllamaToolCall[];
  /** 某些客户端会带 */
  tool_call_id?: string;
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
  messages: OllamaChatMessage[];
  stream?: boolean;
  format?: "json" | Record<string, unknown>;
  tools?: OllamaTool[];
  options?: OllamaOptions;
  keep_alive?: string | number;
}

export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  suffix?: string;
  system?: string;
  template?: string;
  images?: string[];
  stream?: boolean;
  format?: "json" | Record<string, unknown>;
  options?: OllamaOptions;
  raw?: boolean;
  keep_alive?: string | number;
}

export interface OllamaEmbedRequest {
  model: string;
  /** 新版字段 */
  input?: string | string[];
  /** 旧版 /api/embeddings 字段 */
  prompt?: string;
  options?: OllamaOptions;
  keep_alive?: string | number;
  truncate?: boolean;
}

export interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: "assistant";
    content: string;
    images?: null;
    tool_calls?: OllamaToolCall[];
  };
  done: boolean;
  done_reason?: string;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  done_reason?: string;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface OllamaEmbedResponse {
  model: string;
  embeddings: number[][];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
}