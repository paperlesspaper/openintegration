import { embeddedContext, acceptsEmbeddedInit, announceEmbeddedListener } from "./embedded";
import type { JsonRecord, PayloadUpdateHandler, WaitForPayloadOptions } from "./types";

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizePayload(value: unknown): JsonRecord | undefined {
  if (Array.isArray(value)) {
    return { data: value };
  }
  if (!isRecord(value)) {
    return undefined;
  }

  const data = value.data;

  if ((isRecord(data) || Array.isArray(data)) && (value.type === "INIT" || value.cmd === "message")) {
    return Array.isArray(data) ? { data } : data;
  }

  return value;
}

function originAllowed(origin: string, allowedOrigins?: string[]): boolean {
  if (!allowedOrigins || allowedOrigins.length === 0) {
    return true;
  }

  return allowedOrigins.includes(origin);
}

function notifyPayloadUpdate(
  handler: PayloadUpdateHandler | undefined,
  payload: JsonRecord,
  event: MessageEvent
): void {
  if (!handler) {
    return;
  }

  try {
    const result = handler(payload, event);

    if (result && typeof result.then === "function") {
      result.catch((error: unknown) => console.error(error));
    }
  } catch (error) {
    console.error(error);
  }
}

export function waitForPayload(options: WaitForPayloadOptions = {}): Promise<JsonRecord> {
  const { fallback = {}, allowedOrigins, onUpdate, source } = options;
  const timeoutMs = embeddedContext() ? -1 : options.timeoutMs ?? options.timeout ?? 500;

  if (typeof window === "undefined") {
    return Promise.resolve(fallback);
  }

  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      window.removeEventListener("message", onMessage);

      if (timer) {
        clearTimeout(timer);
      }
    };

    const finish = (payload: JsonRecord, event?: MessageEvent) => {
      if (settled) {
        if (event) {
          notifyPayloadUpdate(onUpdate, payload, event);
        }

        return;
      }

      settled = true;

      if (timer) {
        clearTimeout(timer);
      }

      if (!onUpdate) {
        cleanup();
      }

      resolve(payload);
    };

    const onMessage = (event: MessageEvent) => {
      if (source && event.source !== source) return;
      if (typeof event.data?.type === "string" && event.data.type.startsWith("PAPERLESS_")) return;
      if (!acceptsEmbeddedInit(event) || !originAllowed(event.origin, allowedOrigins)) {
        return;
      }

      const payload = normalizePayload(event.data);

      if (payload) {
        finish(payload, event);
      }
    };

    window.addEventListener("message", onMessage);
    announceEmbeddedListener();

    if (timeoutMs >= 0) {
      timer = setTimeout(() => finish(fallback), timeoutMs);
    }
  });
}
