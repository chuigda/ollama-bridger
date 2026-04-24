import type OpenAI from "openai";
import type {
    OllamaChatRequest,
    OllamaChatResponse,
    OllamaGenerateRequest,
    OllamaGenerateResponse,
} from "../ollama/types.js";
import { mapFormat, mapOptions } from "./options.js";
import { ollamaMessagesToOpenAI } from "./messages.js";
import { ollamaToolsToOpenAI, openAIToolCallsToOllama } from "./tools.js";

type ChatParams = OpenAI.Chat.ChatCompletionCreateParams;
type ChatCompletion = OpenAI.Chat.ChatCompletion;
type ChatChunk = OpenAI.Chat.ChatCompletionChunk;
type FinishReason = OpenAI.Chat.ChatCompletion.Choice["finish_reason"];

// ---------- 请求翻译 ----------

export const buildChatParams = (
    req: OllamaChatRequest,
    remoteModel: string,
): ChatParams => {
    const messages = ollamaMessagesToOpenAI(req.messages);
    const tools = ollamaToolsToOpenAI(req.tools);
    const response_format = mapFormat(req.format);
    const opts = mapOptions(req.options);

    return {
        model: remoteModel,
        messages,
        ...(tools ? { tools } : {}),
        ...(response_format ? { response_format } : {}),
        ...opts,
    };
};

export const buildGenerateParams = (
    req: OllamaGenerateRequest,
    remoteModel: string,
): ChatParams => {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (req.system) messages.push({ role: "system", content: req.system });

    if (req.images && req.images.length > 0) {
        const parts: OpenAI.Chat.ChatCompletionContentPart[] = [
            { type: "text", text: req.prompt },
        ];
        for (const img of req.images) {
            const url = img.startsWith("data:")
                ? img
                : `data:image/png;base64,${img}`;
            parts.push({ type: "image_url", image_url: { url } });
        }
        messages.push({ role: "user", content: parts });
    } else {
        messages.push({ role: "user", content: req.prompt });
    }

    return {
        model: remoteModel,
        messages,
        ...(mapFormat(req.format) ? { response_format: mapFormat(req.format)! } : {}),
        ...mapOptions(req.options),
    };
};

// ---------- 响应翻译 ----------

const nowIso = () => new Date().toISOString();
const nsSince = (startMs: number) =>
    Math.round((performance.now() - startMs) * 1e6);

const mapFinishReason = (
    r: FinishReason | null | undefined,
): string | undefined => {
    switch (r) {
        case "stop":
            return "stop";
        case "length":
            return "length";
        case "tool_calls":
        case "function_call":
            return "tool_calls";
        case "content_filter":
            return "content_filter";
        default:
            return r ?? undefined;
    }
};

export const openAIChatToOllama = (
    c: ChatCompletion,
    modelName: string,
    startMs: number,
): OllamaChatResponse => {
    const choice = c.choices[0];
    const msg = choice?.message;
    const toolCalls = openAIToolCallsToOllama(msg?.tool_calls);
    const total = nsSince(startMs);

    return {
        model: modelName,
        created_at: nowIso(),
        message: {
            role: "assistant",
            content: msg?.content ?? "",
            ...(toolCalls ? { tool_calls: toolCalls } : {}),
        },
        done: true,
        done_reason: mapFinishReason(choice?.finish_reason) ?? "stop",
        total_duration: total,
        load_duration: 0,
        prompt_eval_count: c.usage?.prompt_tokens ?? 0,
        prompt_eval_duration: 0,
        eval_count: c.usage?.completion_tokens ?? 0,
        eval_duration: total,
    };
};

export const openAIChatToOllamaGenerate = (
    c: ChatCompletion,
    modelName: string,
    startMs: number,
): OllamaGenerateResponse => {
    const choice = c.choices[0];
    const total = nsSince(startMs);
    return {
        model: modelName,
        created_at: nowIso(),
        response: choice?.message?.content ?? "",
        done: true,
        done_reason: mapFinishReason(choice?.finish_reason) ?? "stop",
        total_duration: total,
        load_duration: 0,
        prompt_eval_count: c.usage?.prompt_tokens ?? 0,
        prompt_eval_duration: 0,
        eval_count: c.usage?.completion_tokens ?? 0,
        eval_duration: total,
    };
};

// ---------- 流式转换 ----------

/**
 * 状态化流转换器：累积 tool_calls 片段（OpenAI 分片发送），并在每个
 * content delta 上产出一个 Ollama chunk；结束时产出 done=true 的尾包。
 */
export class ChatStreamTranslator {
    private readonly startMs = performance.now();
    private finishReason: string | undefined;
    private usage: OpenAI.CompletionUsage | undefined;
    // tool_calls 按 index 聚合
    private readonly toolAcc = new Map<
        number,
        { name: string; arguments: string }
    >();

    constructor(private readonly modelName: string) { }

    /** 处理一个 OpenAI chunk，返回要向客户端发送的 Ollama chunk（可能为 null） */
    handleChunk(chunk: ChatChunk): OllamaChatResponse | null {
        const choice = chunk.choices[0];
        if (chunk.usage) this.usage = chunk.usage;
        if (!choice) return null;

        const delta = choice.delta;
        if (choice.finish_reason) {
            this.finishReason = mapFinishReason(choice.finish_reason);
        }

        // 累积 tool_calls 增量
        if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
                const idx = tc.index;
                const cur = this.toolAcc.get(idx) ?? { name: "", arguments: "" };
                if (tc.function?.name) cur.name += tc.function.name;
                if (tc.function?.arguments) cur.arguments += tc.function.arguments;
                this.toolAcc.set(idx, cur);
            }
        }

        // 只在有文本内容时发中间 chunk
        const content = delta?.content;
        if (typeof content === "string" && content.length > 0) {
            return {
                model: this.modelName,
                created_at: nowIso(),
                message: { role: "assistant", content },
                done: false,
            };
        }
        return null;
    }

    /** 终止：产出 done=true 尾包（含 tool_calls 与统计） */
    finalize(): OllamaChatResponse {
        const total = nsSince(this.startMs);
        const toolCalls =
            this.toolAcc.size > 0
                ? [...this.toolAcc.entries()]
                    .sort(([a], [b]) => a - b)
                    .map(([, v]) => {
                        let args: Record<string, unknown> = {};
                        try {
                            args = v.arguments ? JSON.parse(v.arguments) : {};
                        } catch {
                            args = { _raw: v.arguments };
                        }
                        return { function: { name: v.name, arguments: args } };
                    })
                : undefined;

        return {
            model: this.modelName,
            created_at: nowIso(),
            message: {
                role: "assistant",
                content: "",
                ...(toolCalls ? { tool_calls: toolCalls } : {}),
            },
            done: true,
            done_reason: this.finishReason ?? "stop",
            total_duration: total,
            load_duration: 0,
            prompt_eval_count: this.usage?.prompt_tokens ?? 0,
            prompt_eval_duration: 0,
            eval_count: this.usage?.completion_tokens ?? 0,
            eval_duration: total,
        };
    }
}

/** /api/generate 的流式变体 */
export class GenerateStreamTranslator {
    private readonly startMs = performance.now();
    private finishReason: string | undefined;
    private usage: OpenAI.CompletionUsage | undefined;
    constructor(private readonly modelName: string) { }

    handleChunk(chunk: ChatChunk): OllamaGenerateResponse | null {
        const choice = chunk.choices[0];
        if (chunk.usage) this.usage = chunk.usage;
        if (!choice) return null;
        if (choice.finish_reason) {
            this.finishReason = mapFinishReason(choice.finish_reason);
        }
        const content = choice.delta?.content;
        if (typeof content === "string" && content.length > 0) {
            return {
                model: this.modelName,
                created_at: nowIso(),
                response: content,
                done: false,
            };
        }
        return null;
    }

    finalize(): OllamaGenerateResponse {
        const total = nsSince(this.startMs);
        return {
            model: this.modelName,
            created_at: nowIso(),
            response: "",
            done: true,
            done_reason: this.finishReason ?? "stop",
            total_duration: total,
            load_duration: 0,
            prompt_eval_count: this.usage?.prompt_tokens ?? 0,
            prompt_eval_duration: 0,
            eval_count: this.usage?.completion_tokens ?? 0,
            eval_duration: total,
        };
    }
}

export { nowIso };