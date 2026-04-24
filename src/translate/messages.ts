import type OpenAI from "openai";
import type { OllamaChatMessage } from "../ollama/types.js";
import { ollamaToolCallsToOpenAI } from "./tools.js";

type ChatMessage = OpenAI.Chat.ChatCompletionMessageParam;
type UserContentPart = OpenAI.Chat.ChatCompletionContentPart;

/** 猜测 base64 图片的 mime type（简单签名嗅探） */
const sniffImageMime = (b64: string): string => {
    // 去掉可能的 data: 前缀
    const pure = b64.startsWith("data:") ? b64.split(",", 2)[1] ?? b64 : b64;
    const head = pure.slice(0, 16);
    if (head.startsWith("/9j/")) return "image/jpeg";
    if (head.startsWith("iVBORw0KGgo")) return "image/png";
    if (head.startsWith("R0lGOD")) return "image/gif";
    if (head.startsWith("UklGR")) return "image/webp";
    return "image/png";
};

const toDataUrl = (b64: string): string => {
    if (b64.startsWith("data:")) return b64;
    return `data:${sniffImageMime(b64)};base64,${b64}`;
};

export const ollamaMessagesToOpenAI = (
    messages: OllamaChatMessage[],
): ChatMessage[] => {
    const out: ChatMessage[] = [];
    // 为 role=tool 消息生成/映射 tool_call_id
    // Ollama 协议里 tool 回复通常紧跟在 assistant.tool_calls 之后；
    // 我们用一个滑动队列记录上一条 assistant 产生的 call id 顺序。
    let pendingToolCallIds: string[] = [];

    for (const m of messages) {
        switch (m.role) {
            case "system":
                out.push({ role: "system", content: m.content });
                break;

            case "user": {
                if (m.images && m.images.length > 0) {
                    const parts: UserContentPart[] = [];
                    if (m.content) parts.push({ type: "text", text: m.content });
                    for (const img of m.images) {
                        parts.push({
                            type: "image_url",
                            image_url: { url: toDataUrl(img) },
                        });
                    }
                    out.push({ role: "user", content: parts });
                } else {
                    out.push({ role: "user", content: m.content });
                }
                break;
            }

            case "assistant": {
                const toolCalls = ollamaToolCallsToOpenAI(m.tool_calls);
                if (toolCalls && toolCalls.length > 0) {
                    pendingToolCallIds = toolCalls.map((c) => c.id);
                    out.push({
                        role: "assistant",
                        content: m.content || null,
                        tool_calls: toolCalls,
                    });
                } else {
                    pendingToolCallIds = [];
                    out.push({ role: "assistant", content: m.content });
                }
                break;
            }

            case "tool": {
                // 优先使用显式 tool_call_id；否则按顺序消费上一个 assistant 产生的
                const id =
                    m.tool_call_id ?? pendingToolCallIds.shift() ?? "call_unknown";
                out.push({
                    role: "tool",
                    tool_call_id: id,
                    content: m.content,
                });
                break;
            }
        }
    }
    return out;
};