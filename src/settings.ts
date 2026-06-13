import type { JsonRecord } from "./types";

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function coerceQueryValue(value: string): string | number | boolean {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  if (value !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }

  return value;
}

export function mergeSettings<T extends JsonRecord>(
  ...sources: Array<JsonRecord | Partial<T> | undefined>
): T {
  return Object.assign({}, ...sources.filter(Boolean)) as T;
}

export function getSettings<T extends JsonRecord>(
  payload?: JsonRecord,
  defaults?: T
): T {
  const settings = payload?.meta;

  if (!isRecord(settings) || !isRecord(settings.pluginSettings)) {
    return mergeSettings<T>(defaults);
  }

  return mergeSettings(defaults, settings.pluginSettings as Partial<T>);
}

export function getQuerySettings<T extends JsonRecord>(defaults?: T): T {
  if (typeof window === "undefined") {
    return mergeSettings<T>(defaults);
  }

  const params = new URLSearchParams(window.location.search);
  const values: JsonRecord = {};

  for (const [key, value] of params) {
    values[key] = coerceQueryValue(value);
  }

  return mergeSettings(defaults, values as Partial<T>);
}
