import OpenAI from "openai";
import type { ProviderConfig } from "./types.ts";

const clientCache = new Map<string, OpenAI>();

export function getClient(provider: ProviderConfig): OpenAI {
  const key = `${provider.name}::${provider.baseURL}`;
  let client = clientCache.get(key);
  if (!client) {
    // Some upstream providers (especially "OpenAI-compatible" relays sitting
    // behind Cloudflare) actively block requests carrying the openai-node SDK
    // fingerprint — i.e. the default `User-Agent: OpenAI/JS ...` and the
    // `x-stainless-*` headers. Override them with a benign browser-like UA
    // and strip the stainless fingerprint by default. Anything the user puts
    // in `defaultHeaders` still wins.
    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "x-stainless-arch": "",
      "x-stainless-lang": "",
      "x-stainless-os": "",
      "x-stainless-package-version": "",
      "x-stainless-runtime": "",
      "x-stainless-runtime-version": "",
      ...(provider.defaultHeaders ?? {}),
    };

    client = new OpenAI({
      apiKey: provider.apiKey,
      baseURL: provider.baseURL,
      defaultHeaders: headers,
    });
    clientCache.set(key, client);
  }
  return client;
}