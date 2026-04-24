import type OpenAI from "openai";
import type { OllamaTool, OllamaToolCall } from "../ollama/types.js";

type ChatTool = OpenAI.Chat.ChatCompletionTool;
type ChatToolCall = OpenAI.Chat.ChatCompletionMessageToolCall;

export const ollamaToolsToOpenAI = (
    tools: OllamaTool[] | undefined,
): ChatTool[] | undefined =>
    tools?.map((t) => ({
        type: "function",
        function: {
            name: t.function.name,
            ...(t.function.description ? { description: t.function.description } : {}),
            ...(t.function.parameters
                ? { parameters: t.function.parameters as Record<string, unknown> }
                : {}),
        },
    }));

/** OpenAI 的 tool_calls（arguments 是 JSON 字符串）→ Ollama（arguments 是对象） */
export const openAIToolCallsToOllama = (
    calls: ChatToolCall[] | undefined,
): OllamaToolCall[] | undefined => {
    if (!calls || calls.length === 0) return undefined;
    return calls
        .filter((c) => c.type === "function")
        .map((c) => {
            let args: Record<string, unknown> = {};
            try {
                args = c.function.arguments ? JSON.parse(c.function.arguments) : {};
            } catch {
                // 保留原字符串以便调试
                args = { _raw: c.function.arguments };
            }
            return { function: { name: c.function.name, arguments: args } };
        });
};

/** Ollama 的 tool_calls → OpenAI（arguments 要 stringify） */
export const ollamaToolCallsToOpenAI = (
    calls: OllamaToolCall[] | undefined,
): ChatToolCall[] | undefined => {
    if (!calls || calls.length === 0) return undefined;
    return calls.map((c, i) => ({
        id: `call_${i}_${Math.random().toString(36).slice(2, 10)}`,
        type: "function",
        function: {
            name: c.function.name,
            arguments:
                typeof c.function.arguments === "string"
                    ? c.function.arguments
                    : JSON.stringify(c.function.arguments ?? {}),
        },
    }));
};