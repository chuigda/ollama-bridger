import OpenAI from "openai";
import type { ResolvedConfig } from "../config/loader.js";
import type { UpstreamConfig } from "../config/schema.js";

export class UpstreamPool {
    private readonly cache = new Map<string, OpenAI>();

    constructor(private readonly cfg: ResolvedConfig) { }

    get(name: string): OpenAI {
        const cached = this.cache.get(name);
        if (cached) return cached;
        const up = this.cfg.upstreams.get(name);
        if (!up) throw new Error(`Upstream "${name}" not found`);
        const client = createClient(up);
        this.cache.set(name, client);
        return client;
    }
}

const createClient = (u: UpstreamConfig): OpenAI =>
    new OpenAI({
        baseURL: u.baseURL,
        apiKey: u.apiKey,
        timeout: u.timeoutMs,
        defaultHeaders: u.defaultHeaders,
        ...(u.organization ? { organization: u.organization } : {}),
        ...(u.project ? { project: u.project } : {}),
    });