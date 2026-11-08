import {
  buildCalendarRange,
  fitCalendarLayout,
  normalizeCalendarSettings,
  renderCalendarLayout,
  waitForCalendarImages
} from "./calendar";
import type {
  CalendarDisplaySettings,
  CalendarEvent,
  CalendarHeaderOptions,
  CalendarMessages,
  CalendarRange
} from "./calendar";
import { loadLanguageJson } from "./language";
import { markError, markLoading, markReady } from "./ready";
import { waitForPayload } from "./runtime";
import { getQuerySettings, getSettings, mergeSettings } from "./settings";
import { applyColorTheme, normalizeColorTheme } from "./theme";
import type { JsonRecord } from "./types";

export interface CalendarApiData extends JsonRecord {
  calendarName?: unknown;
  calendarColor?: unknown;
  events?: unknown;
  sample?: unknown;
  source?: unknown;
}

export interface CalendarApiIntegrationContext {
  data: CalendarApiData;
  mergedSettings: JsonRecord;
  messages: JsonRecord;
  payload: JsonRecord;
  range: CalendarRange;
  settings: CalendarDisplaySettings;
}

export interface CalendarApiRequestContext
  extends Omit<CalendarApiIntegrationContext, "data"> {}

export interface BootCalendarApiIntegrationOptions {
  /** Settings shared by the direct fallback and the host-provided payload. */
  defaults: JsonRecord;
  /** Same-origin API route. Settings are sent as a JSON POST body, never in the URL. */
  apiPath?: string;
  /** Heading used when neither settings nor the adapter response provide one. */
  fallbackTitle?: string;
  target?: HTMLElement | string;
  timeoutMs?: number;
  fetch?: typeof fetch;
  buildRequest?: (context: CalendarApiRequestContext) => JsonRecord;
  mapEvents?: (context: CalendarApiIntegrationContext) => CalendarEvent[];
  resolveHeader?: (
    context: CalendarApiIntegrationContext
  ) => CalendarHeaderOptions | undefined;
  resolveMessages?: (
    context: CalendarApiIntegrationContext
  ) => Partial<CalendarMessages>;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (typeof value === "string") {
    return !["false", "0", "off", "no"].includes(value.toLowerCase());
  }
  return Boolean(value);
}

function renderNow(settings: JsonRecord): Date {
  const value = new Date(String(settings.now || ""));
  return Number.isNaN(value.getTime()) ? new Date() : value;
}

function calendarMessages(messages: JsonRecord): Partial<CalendarMessages> {
  const result: Partial<CalendarMessages> = {};
  for (const key of ["allDay", "empty", "moreEvents", "today", "tomorrow", "nextEvent", "ongoing", "later", "untitled", "dayAtGlance", "remainingOne", "remainingMany", "allDayCount", "noMoreToday", "freeAfter", "asOf", "timelineDue", "timelineGap", "timelineRemaining", "timelineFinished"] as const) {
    const value = stringValue(messages[key]);
    if (value) {
      result[key] = value;
    }
  }
  return result;
}

function responseEvents(data: CalendarApiData): CalendarEvent[] {
  return Array.isArray(data.events)
    ? data.events.filter(
        (event): event is CalendarEvent =>
          isRecord(event) && isRecord(event.start)
      )
    : [];
}

async function fetchCalendarData(
  apiPath: string,
  settings: JsonRecord,
  fetchImplementation: typeof fetch
): Promise<CalendarApiData> {
  const url = new URL(apiPath, window.location.href);
  if (url.origin !== window.location.origin) {
    throw new Error("Calendar API path must be same-origin.");
  }
  const response = await fetchImplementation(url, {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings)
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = isRecord(value) ? stringValue(value.error) : "";
    throw new Error(message || `Calendar request failed with ${response.status}`);
  }
  if (!isRecord(value)) {
    throw new Error("Calendar API returned an unexpected response.");
  }
  return value as CalendarApiData;
}

function defaultHeader(context: CalendarApiIntegrationContext, fallbackTitle: string) {
  if (!booleanValue(context.mergedSettings.showHeader, true)) {
    return undefined;
  }
  const calendarName = stringValue(context.data.calendarName);
  const title =
    stringValue(context.mergedSettings.title) || calendarName || fallbackTitle;
  const source = context.data.sample
    ? stringValue(context.messages.sampleSource)
    : stringValue(context.data.source) || fallbackTitle;
  return {
    kicker: calendarName && calendarName !== title ? calendarName : "",
    title,
    source
  };
}

function renderCalendarError(
  target: HTMLElement | string | undefined,
  title: string,
  error: unknown
): void {
  const element =
    target instanceof HTMLElement
      ? target
      : typeof target === "string"
        ? document.querySelector<HTMLElement>(target)
        : document.querySelector<HTMLElement>("#app");
  if (!element) {
    return;
  }

  const section = document.createElement("section");
  section.className = "pp-error";
  const heading = document.createElement("h1");
  heading.textContent = title;
  const detail = document.createElement("p");
  detail.textContent = error instanceof Error ? error.message : String(error);
  section.append(heading, detail);
  element.replaceChildren(section);
}

/**
 * Boot a canonical API-backed calendar integration.
 *
 * Providers only need to return `{ events, calendarName?, source?, sample? }`. The helper owns
 * payload updates, localization, settings normalization, same-origin POST transport, rendering,
 * image/font settling, fitting, and ready/error markers.
 */
export function bootCalendarApiIntegration(
  options: BootCalendarApiIntegrationOptions
): Promise<void> {
  const apiPath = options.apiPath ?? "./api/data";
  const fallbackTitle = options.fallbackTitle ?? document.title ?? "Calendar";
  const fetchImplementation = options.fetch ?? fetch;
  const defaultTheme = normalizeColorTheme(stringValue(options.defaults.color) || "light");
  let revision = 0;

  const renderPayload = async (payload: JsonRecord): Promise<void> => {
    const currentRevision = ++revision;
    let messages: JsonRecord = {};
    try {
      markLoading();
      const languageResult = await loadLanguageJson(payload);
      if (currentRevision !== revision) {
        return;
      }
      messages = languageResult.messages;
      document.documentElement.lang = languageResult.language;
      const overrides = mergeSettings<JsonRecord>(getSettings(payload), getQuerySettings());
      const mergedSettings = mergeSettings<JsonRecord>(options.defaults, overrides);
      applyColorTheme(stringValue(mergedSettings.color), { defaultTheme });
      const settings = normalizeCalendarSettings(overrides, options.defaults);
      const now = renderNow(mergedSettings);
      const range = buildCalendarRange(settings, now);
      const requestContext: CalendarApiRequestContext = {
        mergedSettings,
        messages,
        payload,
        range,
        settings
      };
      const request = options.buildRequest?.(requestContext) ?? {
        ...mergedSettings,
        ...settings,
        rangeStart: range.startKey,
        rangeEndExclusive: range.endKey
      };
      const data = await fetchCalendarData(apiPath, request, fetchImplementation);
      if (currentRevision !== revision) {
        return;
      }
      const context: CalendarApiIntegrationContext = {
        ...requestContext,
        data
      };
      const events = (options.mapEvents?.(context) ?? responseEvents(data)).map((event) => ({
        ...event,
        calendarColor: stringValue(data.calendarColor) || event.calendarColor
      }));
      const header = options.resolveHeader
        ? options.resolveHeader(context)
        : defaultHeader(context, fallbackTitle);
      const layout = renderCalendarLayout({
        target: options.target ?? "#app",
        events,
        settings,
        messages: {
          ...calendarMessages(messages),
          ...(options.resolveMessages?.(context) ?? {})
        },
        now,
        header
      });
      await document.fonts?.ready;
      await waitForCalendarImages(layout);
      if (currentRevision !== revision) {
        return;
      }
      fitCalendarLayout(layout);
      markReady();
    } catch (error) {
      if (currentRevision === revision) {
        renderCalendarError(
          options.target,
          stringValue(messages.errorTitle) || `${fallbackTitle} unavailable`,
          error
        );
        markError(error);
      }
    }
  };

  return waitForPayload({
    timeoutMs: options.timeoutMs ?? 500,
    fallback: {},
    onUpdate: renderPayload
  }).then(renderPayload);
}
