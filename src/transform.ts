import type OpenAI from "openai";
import type {
  ModelConfig,
  OllamaChatRequest,
  OllamaChatResponse,
  OllamaMessage,
  OllamaToolCall,
  ReasoningEffort,
} from "./types.ts";

// ─── Ollama → OpenAI ────────────────────────────────────────────────────────

type OpenAIMessage = OpenAI.ChatCompletionMessageParam;
type ContentPart = OpenAI.ChatCompletionContentPart;

function transformMessage(
  msg: OllamaMessage,
  modelCfg: ModelConfig,
): OpenAIMessage {
  const { role, content, images, tool_calls } = msg;

  // Tool messages pass through directly
  if (role === "tool") {
    return { role: "tool", content, tool_call_id: "" } as OpenAI.ChatCompletionToolMessageParam;
  }

  // Build multimodal content if images are present and the model supports vision
  if (images?.length && modelCfg.supportsVision && role === "user") {
    const parts: ContentPart[] = [];
    if (content) {
      parts.push({ type: "text", text: content });
    }
    for (const img of images) {
      // Ollama sends base64-encoded images; we convert to data URIs
      const dataUri = img.startsWith("data:")
        ? img
        : `data:image/png;base64,${img}`;
      parts.push({
        type: "image_url",
        image_url: { url: dataUri },
      });
    }
    return { role: "user", content: parts };
  }

  // Assistant with tool calls
  if (role === "assistant" && tool_calls?.length) {
    const openaiToolCalls: OpenAI.ChatCompletionMessageToolCall[] =
      tool_calls.map((tc, i) => ({
        id: `call_${i}`,
        type: "function" as const,
        function: {
          name: tc.function.name,
          arguments: JSON.stringify(tc.function.arguments),
        },
      }));
    return {
      role: "assistant",
      content: content || null,
      tool_calls: openaiToolCalls,
    };
  }

  // Default pass-through
  return { role, content } as OpenAIMessage;
}

export function buildOpenAIRequest(
  req: OllamaChatRequest,
  modelCfg: ModelConfig,
): OpenAI.ChatCompletionCreateParams {
  const messages = req.messages.map((m) => transformMessage(m, modelCfg));

  const params: OpenAI.ChatCompletionCreateParams = {
    model: modelCfg.id,
    messages,
    stream: req.stream ?? true,
  };

  // Tools
  if (req.tools?.length && modelCfg.supportsTools) {
    params.tools = req.tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters as
          | OpenAI.FunctionParameters
          | undefined,
      },
    }));
  }

  // Reasoning / thinking
  if (modelCfg.supportsReasoning) {
    const effort: ReasoningEffort =
      req.reasoning_effort ?? modelCfg.defaultReasoningEffort ?? "medium";

    // OpenAI o-series models use `reasoning_effort`
    // We set it as an extra body param since the SDK type may not include it
    (params as Record<string, unknown>)["reasoning_effort"] = effort;
  }

  // Temperature, top_p, etc. from Ollama `options`
  const opts = req.options ?? {};
  if (typeof opts["temperature"] === "number")
    params.temperature = opts["temperature"];
  if (typeof opts["top_p"] === "number") params.top_p = opts["top_p"];
  if (typeof opts["num_predict"] === "number")
    params.max_tokens = opts["num_predict"];
  if (typeof opts["stop"] !== "undefined")
    params.stop = opts["stop"] as string | string[];
  if (typeof opts["seed"] === "number") params.seed = opts["seed"];
  if (typeof opts["frequency_penalty"] === "number")
    params.frequency_penalty = opts["frequency_penalty"];
  if (typeof opts["presence_penalty"] === "number")
    params.presence_penalty = opts["presence_penalty"];

  // Context window size. Ollama uses `num_ctx`; prefer request override,
  // otherwise fall back to the model's configured contextLength. OpenAI chat
  // completions does not have a standard field for this, but many
  // OpenAI-compatible backends (vLLM, llama.cpp server, etc.) accept it as
  // an extra body param, so we pass it through verbatim.
  const numCtx =
    typeof opts["num_ctx"] === "number"
      ? (opts["num_ctx"] as number)
      : modelCfg.contextLength;
  if (typeof numCtx === "number" && numCtx > 0) {
    (params as Record<string, unknown>)["num_ctx"] = numCtx;
  }

  // JSON mode / structured output
  if (req.format === "json") {
    params.response_format = { type: "json_object" };
  } else if (typeof req.format === "object") {
    params.response_format = {
      type: "json_schema",
      json_schema: {
        name: "response",
        strict: true,
        schema: req.format,
      },
    } as OpenAI.ResponseFormatJSONSchema;
  }

  // Stream options for usage info
  if (params.stream) {
    params.stream_options = { include_usage: true };
  }

  return params;
}

// ─── OpenAI → Ollama (non-streaming) ────────────────────────────────────────

export function toOllamaResponse(
  completion: OpenAI.ChatCompletion,
  modelAlias: string,
  think: boolean,
): OllamaChatResponse {
  const choice = completion.choices[0]!;
  const msg = choice.message;

  const ollamaMsg: OllamaMessage = {
    role: "assistant",
    content: msg.content ?? "",
  };

  // Thinking/reasoning content (OpenAI returns it in various ways)
  if (think) {
    const reasoning =
      (msg as unknown as Record<string, unknown>)["reasoning_content"] ??
      (msg as unknown as Record<string, unknown>)["thinking"];
    if (typeof reasoning === "string" && reasoning.length > 0) {
      ollamaMsg.thinking = reasoning;
    }
  }

  // Tool calls
  if (msg.tool_calls?.length) {
    ollamaMsg.tool_calls = msg.tool_calls.map(
      (tc): OllamaToolCall => ({
        function: {
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments) as Record<
            string,
            unknown
          >,
        },
      }),
    );
  }

  const usage = completion.usage;

  return {
    model: modelAlias,
    created_at: new Date().toISOString(),
    message: ollamaMsg,
    done: true,
    done_reason: choice.finish_reason === "stop" ? "stop" : (choice.finish_reason ?? "stop"),
    prompt_eval_count: usage?.prompt_tokens,
    eval_count: usage?.completion_tokens,
    total_duration: 0,
    load_duration: 0,
    prompt_eval_duration: 0,
    eval_duration: 0,
  };
}

// ─── OpenAI SSE → Ollama streaming chunks ───────────────────────────────────

export interface StreamState {
  thinkingBuffer: string;
  inThinking: boolean;
}

export function deltaToOllamaChunk(
  delta: OpenAI.ChatCompletionChunk,
  modelAlias: string,
  think: boolean,
  state: StreamState,
): OllamaChatResponse {
  const choice = delta.choices[0];
  const d = choice?.delta;
  const finishReason = choice?.finish_reason;

  const ollamaMsg: OllamaMessage = {
    role: "assistant",
    content: "",
  };

  if (d) {
    // Regular content
    if (d.content) {
      ollamaMsg.content = d.content;
    }

    // Reasoning / thinking content
    if (think) {
      const reasoning =
        (d as Record<string, unknown>)["reasoning_content"] ??
        (d as Record<string, unknown>)["thinking"];
      if (typeof reasoning === "string" && reasoning.length > 0) {
        ollamaMsg.thinking = reasoning;
        state.thinkingBuffer += reasoning;
        state.inThinking = true;
      } else if (state.inThinking && d.content) {
        // Transition from thinking to content
        state.inThinking = false;
      }
    }

    // Tool calls
    if (d.tool_calls?.length) {
      ollamaMsg.tool_calls = d.tool_calls
        .filter((tc) => tc.function?.name)
        .map(
          (tc): OllamaToolCall => ({
            function: {
              name: tc.function!.name!,
              arguments: tc.function?.arguments
                ? (JSON.parse(tc.function.arguments) as Record<string, unknown>)
                : {},
            },
          }),
        );
    }
  }

  const done = finishReason != null;
  const usage = delta.usage;

  return {
    model: modelAlias,
    created_at: new Date().toISOString(),
    message: ollamaMsg,
    done,
    ...(done && {
      done_reason: finishReason === "stop" ? "stop" : finishReason ?? "stop",
      prompt_eval_count: usage?.prompt_tokens ?? 0,
      eval_count: usage?.completion_tokens ?? 0,
      total_duration: 0,
      load_duration: 0,
      prompt_eval_duration: 0,
      eval_duration: 0,
    }),
  };
}