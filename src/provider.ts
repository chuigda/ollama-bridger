import OpenAI from "openai";
import type { ProviderConfig } from "./types.ts";

const clientCache = new Map<string, OpenAI>();

export function getClient(provider: ProviderConfig): OpenAI {
  const key = `${provider.name}::${provider.baseURL}`;
  let client = clientCache.get(key);
  if (!client) {
    client = new OpenAI({
      apiKey: provider.apiKey,
      baseURL: provider.baseURL,
      defaultHeaders: provider.defaultHeaders as Record<string, string>,
    });
    clientCache.set(key, client);
  }
  return client;
}