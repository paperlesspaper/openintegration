import type { JsonRecord, WaitForPayloadOptions } from "./types";

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizePayload(value: unknown): JsonRecord | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const data = value.data;

  if (isRecord(data) && (value.type === "INIT" || value.cmd === "message")) {
    return data;
  }

  return value;
}

function originAllowed(origin: string, allowedOrigins?: string[]): boolean {
  if (!allowedOrigins || allowedOrigins.length === 0) {
    return true;
  }

  return allowedOrigins.includes(origin);
}

export function waitForPayload(options: WaitForPayloadOptions = {}): Promise<JsonRecord> {
  const { fallback = {}, allowedOrigins } = options;
  const timeoutMs = options.timeoutMs ?? options.timeout ?? 500;

  if (typeof window === "undefined") {
    return Promise.resolve(fallback);
  }

  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (payload: JsonRecord) => {
      if (settled) {
        return;
      }

      settled = true;
      window.removeEventListener("message", onMessage);

      if (timer) {
        clearTimeout(timer);
      }

      resolve(payload);
    };

    const onMessage = (event: MessageEvent) => {
      if (!originAllowed(event.origin, allowedOrigins)) {
        return;
      }

      const payload = normalizePayload(event.data);

      if (payload) {
        finish(payload);
      }
    };

    window.addEventListener("message", onMessage);

    if (timeoutMs >= 0) {
      timer = setTimeout(() => finish(fallback), timeoutMs);
    }
  });
}
