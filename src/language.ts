import type { JsonRecord } from "./types";

export interface ResolveLanguageOptions {
  requested?: string;
  supported?: string[];
  defaultLanguage?: string;
}

export interface LoadLanguageJsonOptions extends ResolveLanguageOptions {
  basePath?: string;
  fetch?: (input: string, init?: RequestInit) => Promise<Response>;
}

export interface LanguageJsonResult<TMessages extends JsonRecord = JsonRecord> {
  language: string;
  messages: TMessages;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isLanguageCode(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(value.trim());
}

function normalizeLanguage(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && isLanguageCode(trimmed) ? trimmed : undefined;
}

function payloadManifestLanguages(payload?: JsonRecord): string[] {
  const meta = isRecord(payload?.meta) ? payload.meta : undefined;
  const manifest = isRecord(meta?.pluginManifest) ? meta.pluginManifest : undefined;

  return Array.isArray(manifest?.language)
    ? manifest.language.filter(isLanguageCode)
    : [];
}

function defaultFetch(input: string, init?: RequestInit): Promise<Response> {
  if (typeof fetch !== "function") {
    throw new Error("fetch is not available to load language JSON");
  }

  return fetch(input, init);
}

function languagePath(basePath: string, language: string): string {
  return `${basePath.replace(/\/+$/, "")}/${encodeURIComponent(language)}.json`;
}

export function getPayloadLanguage(payload?: JsonRecord): string | undefined {
  const meta = isRecord(payload?.meta) ? payload.meta : undefined;
  return normalizeLanguage(typeof meta?.language === "string" ? meta.language : undefined);
}

export function resolveLanguage({
  requested,
  supported = [],
  defaultLanguage
}: ResolveLanguageOptions): string {
  const supportedCodes = supported.filter(isLanguageCode);
  const requestedCode = normalizeLanguage(requested);

  if (requestedCode) {
    const exact = supportedCodes.find((code) => code === requestedCode);

    if (exact) {
      return exact;
    }

    const exactInsensitive = supportedCodes.find(
      (code) => code.toLowerCase() === requestedCode.toLowerCase()
    );

    if (exactInsensitive) {
      return exactInsensitive;
    }

    const requestedBase = requestedCode.split("-")[0]?.toLowerCase();
    const base = supportedCodes.find((code) => code.toLowerCase() === requestedBase);

    if (base) {
      return base;
    }
  }

  const defaultCode = normalizeLanguage(defaultLanguage);

  if (defaultCode) {
    const defaultMatch = supportedCodes.find((code) => code === defaultCode);

    if (defaultMatch) {
      return defaultMatch;
    }

    const defaultInsensitive = supportedCodes.find(
      (code) => code.toLowerCase() === defaultCode.toLowerCase()
    );

    if (defaultInsensitive) {
      return defaultInsensitive;
    }

    if (supportedCodes.length === 0) {
      return defaultCode;
    }
  }

  return supportedCodes[0] ?? "de";
}

export async function loadLanguageJson<TMessages extends JsonRecord = JsonRecord>(
  payload?: JsonRecord,
  options: LoadLanguageJsonOptions = {}
): Promise<LanguageJsonResult<TMessages>> {
  const supported = options.supported ?? payloadManifestLanguages(payload);
  const defaultLanguage = options.defaultLanguage ?? supported[0] ?? "de";
  const language = resolveLanguage({
    defaultLanguage,
    requested: options.requested ?? getPayloadLanguage(payload),
    supported
  });
  const response = await (options.fetch ?? defaultFetch)(
    languagePath(options.basePath ?? "./languages", language)
  );

  if (!response.ok) {
    throw new Error(`Could not load language JSON for ${language}: ${response.status}`);
  }

  const messages = (await response.json()) as unknown;

  if (!isRecord(messages)) {
    throw new Error(`Language JSON for ${language} must contain an object`);
  }

  return {
    language,
    messages: messages as TMessages
  };
}
