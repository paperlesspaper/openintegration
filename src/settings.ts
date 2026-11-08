import type { JsonRecord } from "./types";

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const pluginMessageSource = "paperlesspaper-plugin";

export interface PostSettingsMessageOptions {
  targetOrigin?: string;
  target?: Window;
  legacy?: boolean;
}

export interface SettingsHeightOptions extends PostSettingsMessageOptions {
  minHeight?: number;
  root?: HTMLElement;
}

export interface SetupSettingsPageOptions extends SettingsHeightOptions {
  onPayload?: (payload: JsonRecord, event: MessageEvent) => void;
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

function targetWindow(target?: Window): Window | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return target ?? window.parent;
}

function postToParent(message: JsonRecord, options: PostSettingsMessageOptions = {}): void {
  const target = targetWindow(options.target);

  if (!target) {
    return;
  }

  target.postMessage(message, options.targetOrigin ?? "*");
}

function payloadFromSettingsMessage(message: unknown): JsonRecord | undefined {
  if (!isRecord(message)) {
    return undefined;
  }

  if (isRecord(message.data) && (message.type === "INIT" || message.cmd === "message")) {
    return message.data;
  }

  if (isRecord(message.payload)) {
    return message.payload;
  }

  return undefined;
}

export function getSettingsFromMessage<T extends JsonRecord>(
  message: unknown,
  defaults?: T
): T | undefined {
  if (!isRecord(message)) {
    return undefined;
  }

  const payload = payloadFromSettingsMessage(message);

  if (payload) {
    return getSettings(payload, defaults);
  }

  if (isRecord(message.pluginSettings)) {
    return mergeSettings(defaults, message.pluginSettings as Partial<T>);
  }

  if (isRecord(message.settings)) {
    return mergeSettings(defaults, message.settings as Partial<T>);
  }

  return undefined;
}

export function postSettingsUpdate(
  settingsPatch: JsonRecord,
  options: PostSettingsMessageOptions = {}
): void {
  postToParent(
    {
      source: pluginMessageSource,
      type: "UPDATE_SETTINGS",
      payload: settingsPatch
    },
    options
  );

  if (options.legacy !== false) {
    postToParent(
      {
        type: "paperlesspaper:settings:update",
        pluginSettings: settingsPatch
      },
      options
    );
  }
}

export function postSettingsReady(options: PostSettingsMessageOptions = {}): void {
  postToParent(
    {
      source: pluginMessageSource,
      type: "READY"
    },
    options
  );

  if (options.legacy !== false) {
    postToParent({ type: "paperlesspaper:settings:ready" }, options);
  }
}

export function getSettingsPageHeight(root?: HTMLElement): number {
  if (typeof document === "undefined") {
    return 0;
  }

  const element = root ?? document.documentElement;
  const body = document.body;
  const rect = element.getBoundingClientRect();
  const bodyRect = body?.getBoundingClientRect();

  return Math.ceil(
    Math.max(
      rect.height,
      element.scrollHeight,
      element.offsetHeight,
      bodyRect?.height ?? 0,
      body?.scrollHeight ?? 0,
      body?.offsetHeight ?? 0
    )
  );
}

export function postSettingsHeight(
  height = getSettingsPageHeight(),
  options: SettingsHeightOptions = {}
): void {
  const nextHeight = Math.max(options.minHeight ?? 0, Math.ceil(Number(height)));

  if (!Number.isFinite(nextHeight) || nextHeight <= 0) {
    return;
  }

  postToParent(
    {
      source: pluginMessageSource,
      type: "SET_HEIGHT",
      payload: {
        height: nextHeight
      }
    },
    options
  );

  if (options.legacy !== false) {
    postToParent(
      {
        type: "paperlesspaper:settings:height",
        height: nextHeight
      },
      options
    );
  }
}

export function observeSettingsHeight(options: SettingsHeightOptions = {}): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }

  const root = options.root ?? document.documentElement;
  let frame = 0;
  let lastHeight = 0;

  const measure = () => {
    frame = 0;
    const height = getSettingsPageHeight(root);

    if (height !== lastHeight) {
      lastHeight = height;
      postSettingsHeight(height, options);
    }
  };

  const schedule = () => {
    if (frame) {
      return;
    }

    frame = window.requestAnimationFrame(measure);
  };

  const resizeObserver =
    typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(schedule);
  resizeObserver?.observe(root);

  if (document.body && document.body !== root) {
    resizeObserver?.observe(document.body);
  }

  const mutationObserver =
    typeof MutationObserver === "undefined"
      ? undefined
      : new MutationObserver(schedule);
  mutationObserver?.observe(root, {
    attributes: true,
    childList: true,
    subtree: true
  });

  window.addEventListener("load", schedule);
  window.addEventListener("resize", schedule);
  schedule();

  return () => {
    if (frame) {
      window.cancelAnimationFrame(frame);
    }

    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
    window.removeEventListener("load", schedule);
    window.removeEventListener("resize", schedule);
  };
}

export function setupSettingsPage(options: SetupSettingsPageOptions = {}): () => void {
  const stopObservingHeight = observeSettingsHeight(options);

  if (typeof window === "undefined") {
    return stopObservingHeight;
  }

  const onMessage = (event: MessageEvent) => {
    const payload = payloadFromSettingsMessage(event.data);

    if (payload) {
      options.onPayload?.(payload, event);
      postSettingsHeight(getSettingsPageHeight(options.root), options);
    }
  };

  window.addEventListener("message", onMessage);
  postSettingsReady(options);

  return () => {
    window.removeEventListener("message", onMessage);
    stopObservingHeight();
  };
}
