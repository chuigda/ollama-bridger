import type OpenAI from "openai";
import type {
    OllamaEmbedRequest,
    OllamaEmbedResponse,
} from "../ollama/types.js";

type EmbedParams = OpenAI.Embeddings.EmbeddingCreateParams;
type EmbedResponse = OpenAI.Embeddings.CreateEmbeddingResponse;

export const normalizeEmbedInput = (
    req: OllamaEmbedRequest,
): string[] => {
    if (Array.isArray(req.input)) return req.input;
    if (typeof req.input === "string") return [req.input];
    if (typeof req.prompt === "string") return [req.prompt];
    return [];
};

export const buildEmbedParams = (
    req: OllamaEmbedRequest,
    remoteModel: string,
): EmbedParams => ({
    model: remoteModel,
    input: normalizeEmbedInput(req),
});

export const openAIEmbedToOllama = (
    r: EmbedResponse,
    modelName: string,
    startNs: bigint,
): OllamaEmbedResponse => ({
    model: modelName,
    embeddings: r.data
        .slice()
        .sort((a, b) => a.index - b.index)
        .map((d) => d.embedding as number[]),
    total_duration: Number(process.hrtime.bigint() - startNs),
    load_duration: 0,
    prompt_eval_count: r.usage?.prompt_tokens ?? 0,
});