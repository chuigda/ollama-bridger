import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { AppConfig, ResolvedModel } from "./types.ts";

let _config: AppConfig | null = null;
let _modelIndex: Map<string, ResolvedModel> | null = null;

export async function loadConfig(
  path = resolve(process.cwd(), "config.json"),
): Promise<AppConfig> {
  const raw = await readFile(path, "utf-8");
  const config = JSON.parse(raw) as AppConfig;

  // Build model lookup index
  _modelIndex = new Map<string, ResolvedModel>();
  for (const provider of config.providers) {
    for (const model of provider.models) {
      const entry: ResolvedModel = { provider, model };
      // Register both alias and raw id for flexible matching
      _modelIndex.set(model.alias, entry);
      _modelIndex.set(model.id, entry);
      // Also register without the `:latest` suffix
      if (model.alias.endsWith(":latest")) {
        _modelIndex.set(model.alias.slice(0, -7), entry);
      }
    }
  }

  _config = config;
  return config;
}

export function getConfig(): AppConfig {
  if (!_config) throw new Error("Config not loaded");
  return _config;
}

export function resolveModel(nameOrAlias: string): ResolvedModel | undefined {
  if (!_modelIndex) throw new Error("Config not loaded");
  return _modelIndex.get(nameOrAlias);
}

export function getAllResolvedModels(): ResolvedModel[] {
  if (!_modelIndex) throw new Error("Config not loaded");
  // Deduplicate by alias (primary key)
  const seen = new Set<string>();
  const results: ResolvedModel[] = [];
  for (const [, resolved] of _modelIndex) {
    if (!seen.has(resolved.model.alias)) {
      seen.add(resolved.model.alias);
      results.push(resolved);
    }
  }
  return results;
}