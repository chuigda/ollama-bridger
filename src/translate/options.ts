import type { OllamaOptions } from "../ollama/types.js";
import type OpenAI from "openai";

type ChatParams = OpenAI.Chat.ChatCompletionCreateParams;

/** Ollama options → OpenAI chat params 子集 */
export const mapOptions = (
    opts: OllamaOptions | undefined,
): Partial<ChatParams> => {
    if (!opts) return {};
    const out: Partial<ChatParams> = {};
    if (typeof opts.temperature === "number") out.temperature = opts.temperature;
    if (typeof opts.top_p === "number") out.top_p = opts.top_p;
    if (typeof opts.num_predict === "number" && opts.num_predict > 0)
        out.max_tokens = opts.num_predict;
    if (typeof opts.seed === "number") out.seed = opts.seed;
    if (typeof opts.frequency_penalty === "number")
        out.frequency_penalty = opts.frequency_penalty;
    if (typeof opts.presence_penalty === "number")
        out.presence_penalty = opts.presence_penalty;
    if (opts.stop !== undefined) out.stop = opts.stop;
    // num_ctx / top_k / repeat_penalty 在 OpenAI 协议上无直接对应，忽略
    return out;
};

/** Ollama format → OpenAI response_format */
export const mapFormat = (
    format: "json" | Record<string, unknown> | undefined,
): ChatParams["response_format"] | undefined => {
    if (!format) return undefined;
    if (format === "json") return { type: "json_object" };
    // 结构化 JSON schema（Ollama 0.5+ 允许传 JSON schema 对象）
    return {
        type: "json_schema",
        json_schema: {
            name: "response",
            strict: true,
            schema: format,
        },
    };
};