import { fitText } from "./fitText";
import { escapeHtml } from "./html";
import { fitToScreen } from "./resize";

export type CalendarView = "day-timeline" | "agenda" | "agenda-modern" | "today-next" | "day" | "three-days" | "week" | "rolling-week" | "rolling-week-list" | "year";

export interface CalendarDateValue {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

export interface CalendarEventDetail {
  label?: unknown;
  value: unknown;
  visible?: boolean;
}

export interface CalendarEvent {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  /** Task deadlines use start as their due time; they do not occupy the timeline. */
  kind?: "event" | "task";
  busy?: boolean;
  start: CalendarDateValue;
  end?: CalendarDateValue;
  location?: unknown;
  /** Provider event override, then parent calendar color; CSS hex or named colors. */
  color?: string;
  calendarColor?: string;
  iconName?: string;
  imageUrl?: string;
  details?: CalendarEventDetail[];
}

export interface CalendarMessages {
  allDay: string;
  empty: string;
  moreEvents: string;
  today: string;
  tomorrow: string;
  nextEvent: string;
  ongoing: string;
  later: string;
  untitled: string;
  dayAtGlance: string;
  remainingOne: string;
  remainingMany: string;
  allDayCount: string;
  noMoreToday: string;
  freeAfter: string;
  asOf: string;
  timelineDue: string;
  timelineGap: string;
  timelineRemaining: string;
  timelineFinished: string;
}

export interface CalendarDisplaySettings {
  view: CalendarView;
  fontSize: number;
  noPadding: boolean;
  fullWeekdayNames: boolean;
  locale: string;
  timeZone?: string;
  dayRange: number;
  maxEvents: number;
  highlightToday: boolean;
  highlightScale: number;
  showLocation: boolean;
  showEventIcons: boolean;
  showEventImages: boolean;
  timelineShowSidebar: boolean;
  timelineShowNow: boolean;
  timelineShowGaps: boolean;
  timelineGapMinutes: number;
  showDaySummary: boolean;
  automaticEventIcons: boolean;
  showHeader: boolean;
  personalTitle: string;
  personalSubtitle: string;
  informationDensity: "automatic" | "comfortable" | "compact" | "spacious";
}

export type CalendarSettingsInput =
  | Partial<CalendarDisplaySettings>
  | Record<string, unknown>;

export interface CalendarHeaderOptions {
  kicker?: unknown;
  title?: unknown;
  subtitle?: unknown;
  source?: unknown;
}

export interface CalendarRange {
  view: CalendarView;
  startDate: Date;
  endDate: Date;
  startKey: string;
  endKey: string;
  dateKeys: string[];
}

export interface PreparedCalendarEvent {
  event: CalendarEvent;
  dateKey: string;
  startDate: Date | null;
  sortTime: number;
}

export interface RenderCalendarLayoutOptions {
  target?: HTMLElement | string;
  events?: CalendarEvent[];
  settings?: CalendarSettingsInput;
  messages?: Partial<CalendarMessages>;
  now?: Date | string | number;
  header?: CalendarHeaderOptions;
  iconAliases?: Record<string, string>;
  className?: string;
}

export interface CalendarLayoutElements {
  target: HTMLElement;
  shell: HTMLElement;
  body: HTMLElement;
  settings: CalendarDisplaySettings;
  events: PreparedCalendarEvent[];
  range: CalendarRange;
}

export interface FitCalendarLayoutOptions {
  min?: number;
  max?: number;
  step?: number;
  tolerance?: number;
  fitScreen?: boolean;
  screenPadding?: number;
}

export const DEFAULT_CALENDAR_SETTINGS: CalendarDisplaySettings = {
  view: "agenda",
  fontSize: 100,
  noPadding: false,
  fullWeekdayNames: false,
  locale: "en",
  dayRange: 14,
  maxEvents: 20,
  highlightToday: false,
  highlightScale: 1,
  showLocation: true,
  showEventIcons: true,
  showEventImages: true,
  timelineShowSidebar: true,
  timelineShowNow: true,
  timelineShowGaps: true,
  timelineGapMinutes: 30,
  showDaySummary: false,
  automaticEventIcons: false,
  showHeader: true,
  personalTitle: "",
  personalSubtitle: "",
  informationDensity: "comfortable"
};

export const DEFAULT_CALENDAR_MESSAGES: CalendarMessages = {
  allDay: "All day",
  empty: "No events",
  moreEvents: "+{count} more",
  today: "Today",
  tomorrow: "Tomorrow",
  nextEvent: "Up next",
  ongoing: "Now",
  later: "Coming up",
  untitled: "Untitled event",
  dayAtGlance: "Your day at a glance",
  remainingOne: "1 timed event remaining",
  remainingMany: "{count} timed events remaining",
  allDayCount: "{count} all-day",
  noMoreToday: "No more timed events today",
  freeAfter: "No timed events after {time}",
  asOf: "As of {time}",
  timelineDue: "Due today",
  timelineGap: "{duration} free",
  timelineRemaining: "{count} remaining",
  timelineFinished: "No more appointments today"
};

const VIEW_ALIASES: Record<string, CalendarView> = {
  "day-timeline": "day-timeline",
  agenda: "agenda",
  "agenda-modern": "agenda-modern",
  "today-next": "today-next",
  day: "day",
  "3-days": "three-days",
  "3days": "three-days",
  three: "three-days",
  "three-day": "three-days",
  "three-days": "three-days",
  week: "week",
  "rolling-week": "rolling-week",
  "rolling-week-list": "rolling-week-list",
  year: "year"
};

const VIEW_CLASSES = [
  "pp-cal--view-day-timeline",
  "pp-cal--view-agenda",
  "pp-cal--view-agenda-modern",
  "pp-cal--view-today-next",
  "pp-cal--view-day",
  "pp-cal--view-three-days",
  "pp-cal--view-week",
  "pp-cal--view-rolling-week",
  "pp-cal--view-rolling-week-list",
  "pp-cal--view-year"
];

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function hasText(value: unknown): boolean {
  return text(value).length > 0;
}

function validTimeZone(value: unknown): string | undefined {
  const timeZone = text(value);
  if (!timeZone) {
    return undefined;
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return undefined;
  }
}

function validLocale(value: unknown, fallback: string): string {
  const locale = text(value) || fallback;
  try {
    new Intl.DateTimeFormat(locale).format(new Date());
    return locale;
  } catch {
    return fallback;
  }
}

export function normalizeCalendarSettings(
  input: CalendarSettingsInput | undefined,
  defaults: Partial<CalendarDisplaySettings> = {}
): CalendarDisplaySettings {
  const base = { ...DEFAULT_CALENDAR_SETTINGS, ...defaults };
  const source = (input || {}) as Record<string, unknown>;
  const requestedView = text(source.view).toLowerCase();
  const view = VIEW_ALIASES[requestedView] ?? base.view;
  const localeValue = source.locale ?? source.language;
  const dayRangeValue = source.dayRange ?? source.daysAhead;

  return {
    view,
    fontSize: clampNumber(source.fontSize, base.fontSize, 75, 150),
    noPadding: parseBoolean(source.noPadding, base.noPadding),
    fullWeekdayNames: parseBoolean(source.fullWeekdayNames, base.fullWeekdayNames),
    locale: validLocale(localeValue, base.locale),
    timeZone: validTimeZone(source.timeZone ?? base.timeZone),
    dayRange: clampInteger(dayRangeValue, base.dayRange, 1, 366),
    maxEvents: clampInteger(source.maxEvents, base.maxEvents, 1, 200),
    highlightToday: parseBoolean(source.highlightToday, base.highlightToday),
    highlightScale: clampNumber(source.highlightScale, base.highlightScale, 1, 3),
    showLocation: parseBoolean(source.showLocation, base.showLocation),
    showEventIcons: parseBoolean(source.showEventIcons, base.showEventIcons),
    showEventImages: parseBoolean(source.showEventImages, base.showEventImages),
    timelineShowSidebar: parseBoolean(source.timelineShowSidebar, base.timelineShowSidebar),
    timelineShowNow: parseBoolean(source.timelineShowNow, base.timelineShowNow),
    timelineShowGaps: parseBoolean(source.timelineShowGaps, base.timelineShowGaps),
    timelineGapMinutes: clampInteger(source.timelineGapMinutes, base.timelineGapMinutes, 15, 240),
    showDaySummary: parseBoolean(source.showDaySummary, base.showDaySummary),
    automaticEventIcons: parseBoolean(source.automaticEventIcons, base.automaticEventIcons),
    showHeader: parseBoolean(source.showHeader, base.showHeader),
    personalTitle: text(source.personalTitle ?? base.personalTitle).slice(0, 100),
    personalSubtitle: text(source.personalSubtitle ?? base.personalSubtitle).slice(0, 160),
    informationDensity: ["automatic", "comfortable", "compact", "spacious"].includes(text(source.informationDensity))
      ? source.informationDensity as CalendarDisplaySettings["informationDensity"] : base.informationDensity
  };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function partsToDateKey(parts: Intl.DateTimeFormatPart[]): string | null {
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year && values.month && values.day
    ? `${values.year}-${values.month}-${values.day}`
    : null;
}

function dateKeyFromDate(value: Date, timeZone?: string): string {
  if (Number.isNaN(value.getTime())) {
    return "";
  }
  if (timeZone) {
    try {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      });
      const formatted = partsToDateKey(formatter.formatToParts(value));
      if (formatted) {
        return formatted;
      }
    } catch {
      // Fall through to the local calendar date.
    }
  }
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function dateKeyToUtcDate(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function dateKeyToDisplayDate(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function addDaysToKey(dateKey: string, count: number): string {
  const date = dateKeyToUtcDate(dateKey);
  date.setUTCDate(date.getUTCDate() + count);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function dateKeysBetween(startKey: string, endKey: string): string[] {
  const result: string[] = [];
  for (let key = startKey; key < endKey; key = addDaysToKey(key, 1)) {
    result.push(key);
  }
  return result;
}

function normalizeNow(value?: Date | string | number): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value ?? Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export function buildCalendarRange(
  settingsInput: CalendarSettingsInput = {},
  now?: Date | string | number
): CalendarRange {
  const settings = normalizeCalendarSettings(settingsInput);
  const referenceKey = dateKeyFromDate(normalizeNow(now), settings.timeZone);
  let startKey = referenceKey;
  let endKey = addDaysToKey(startKey, 1);

  if (["agenda", "agenda-modern", "today-next"].includes(settings.view)) {
    endKey = addDaysToKey(startKey, settings.dayRange);
  } else if (settings.view === "three-days") {
    endKey = addDaysToKey(startKey, 3);
  } else if (settings.view === "rolling-week" || settings.view === "rolling-week-list") {
    endKey = addDaysToKey(startKey, 7);
  } else if (settings.view === "week") {
    const day = dateKeyToUtcDate(referenceKey).getUTCDay();
    startKey = addDaysToKey(referenceKey, -((day + 6) % 7));
    endKey = addDaysToKey(startKey, 7);
  } else if (settings.view === "year") {
    const year = Number(referenceKey.slice(0, 4));
    startKey = `${year}-01-01`;
    endKey = `${year + 1}-01-01`;
  }

  return {
    view: settings.view,
    startDate: dateKeyToDisplayDate(startKey),
    endDate: dateKeyToDisplayDate(endKey),
    startKey,
    endKey,
    dateKeys: dateKeysBetween(startKey, endKey)
  };
}

function eventDateKey(event: CalendarEvent, settings: CalendarDisplaySettings): string {
  const dateOnly = text(event.start?.date).slice(0, 10);
  if (DATE_KEY_PATTERN.test(dateOnly)) {
    return dateOnly;
  }

  const rawDateTime = text(event.start?.dateTime);
  const date = new Date(rawDateTime);
  if (!Number.isNaN(date.getTime())) {
    return dateKeyFromDate(date, settings.timeZone ?? validTimeZone(event.start?.timeZone));
  }

  const prefix = rawDateTime.slice(0, 10);
  return DATE_KEY_PATTERN.test(prefix) ? prefix : "";
}

function eventLastDateKey(
  event: CalendarEvent,
  settings: CalendarDisplaySettings,
  startKey: string
): string {
  const endDate = text(event.end?.date).slice(0, 10);
  if (DATE_KEY_PATTERN.test(endDate)) {
    const inclusiveEnd = addDaysToKey(endDate, -1);
    return inclusiveEnd >= startKey ? inclusiveEnd : startKey;
  }

  const endDateTime = new Date(text(event.end?.dateTime));
  if (!Number.isNaN(endDateTime.getTime())) {
    const startDateTime = new Date(text(event.start?.dateTime));
    const inclusiveEnd = new Date(
      endDateTime.getTime() > startDateTime.getTime()
        ? endDateTime.getTime() - 1
        : endDateTime.getTime()
    );
    const endKey = dateKeyFromDate(
      inclusiveEnd,
      settings.timeZone ?? validTimeZone(event.end?.timeZone) ?? validTimeZone(event.start?.timeZone)
    );
    return endKey >= startKey ? endKey : startKey;
  }

  return startKey;
}

function eventVisibleDateKeys(
  event: CalendarEvent,
  settings: CalendarDisplaySettings,
  range: CalendarRange
): string[] {
  const startKey = eventDateKey(event, settings);
  if (!startKey) {
    return [];
  }
  const lastKey = eventLastDateKey(event, settings, startKey);
  const visibleStart = startKey < range.startKey ? range.startKey : startKey;
  const eventEndExclusive = addDaysToKey(lastKey, 1);
  const visibleEnd = eventEndExclusive > range.endKey ? range.endKey : eventEndExclusive;
  return visibleStart < visibleEnd ? dateKeysBetween(visibleStart, visibleEnd) : [];
}

function eventSortTime(event: CalendarEvent, dateKey: string): number {
  const dateTime = new Date(text(event.start?.dateTime));
  if (!Number.isNaN(dateTime.getTime())) {
    return dateTime.getTime();
  }
  return dateKeyToUtcDate(dateKey).getTime() - 43_200_000;
}

export function prepareCalendarEvents(
  events: CalendarEvent[],
  settingsInput: CalendarSettingsInput = {},
  now?: Date | string | number
): PreparedCalendarEvent[] {
  const settings = normalizeCalendarSettings(settingsInput);
  const range = buildCalendarRange(settings, now);

  return (Array.isArray(events) ? events : [])
    .flatMap((event) => {
      const rawStart = new Date(text(event.start?.dateTime));
      return eventVisibleDateKeys(event, settings, range).map((dateKey) => ({
          event,
          dateKey,
          startDate: Number.isNaN(rawStart.getTime()) ? null : rawStart,
          sortTime: eventSortTime(event, dateKey)
        }));
    })
    .sort((left, right) => {
      const dateOrder = left.dateKey.localeCompare(right.dateKey);
      if (dateOrder) {
        return dateOrder;
      }
      const leftAllDay = hasText(left.event.start?.date);
      const rightAllDay = hasText(right.event.start?.date);
      if (leftAllDay !== rightAllDay) {
        return leftAllDay ? -1 : 1;
      }
      return left.sortTime - right.sortTime;
    });
}

function resolveTarget(target?: HTMLElement | string): HTMLElement {
  if (target instanceof HTMLElement) {
    return target;
  }
  if (typeof target === "string") {
    const element = document.querySelector<HTMLElement>(target);
    if (!element) {
      throw new Error(`Could not find calendar target: ${target}`);
    }
    return element;
  }
  return document.querySelector<HTMLElement>("#app") ?? document.body;
}

function formatCivilDate(
  dateKey: string,
  locale: string,
  options: Intl.DateTimeFormatOptions
): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(
    dateKeyToUtcDate(dateKey)
  );
}

function formatTime(
  value: CalendarDateValue | undefined,
  locale: string,
  displayTimeZone?: string
): string {
  const date = new Date(text(value?.dateTime));
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const timeZone = validTimeZone(displayTimeZone) ?? validTimeZone(value?.timeZone);
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {})
  }).format(date);
}

function eventTimeText(
  event: CalendarEvent,
  settings: CalendarDisplaySettings,
  messages: CalendarMessages
): string {
  if (hasText(event.start?.date)) {
    return messages.allDay;
  }
  const start = formatTime(event.start, settings.locale, settings.timeZone);
  const end = formatTime(event.end, settings.locale, settings.timeZone);
  return end && end !== start ? `${start} – ${end}` : start;
}

function formatRangeTitle(range: CalendarRange, settings: CalendarDisplaySettings): string {
  if (range.view === "year") {
    return range.startKey.slice(0, 4);
  }
  if (range.view === "day") {
    return formatCivilDate(range.startKey, settings.locale, {
      weekday: "long",
      month: "long",
      day: "numeric"
    });
  }
  const endInclusive = addDaysToKey(range.endKey, -1);
  const start = formatCivilDate(range.startKey, settings.locale, {
    month: "short",
    day: "numeric"
  });
  const end = formatCivilDate(endInclusive, settings.locale, {
    month: "short",
    day: "numeric"
  });
  return start === end ? start : `${start} – ${end}`;
}

function normalizeIconName(value: unknown): string {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function safeImageUrl(value: unknown): string {
  const candidate = text(value);
  if (!candidate) {
    return "";
  }
  try {
    const url = new URL(candidate, window.location.href);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

const calendarIconAliases: Record<string, string> = {
  appointment: "calendar", birthday: "birthday-cake", work: "suitcase", office: "suitcase",
  briefcase: "suitcase", meeting: "group", call: "phone", dentist: "healthcare",
  doctor: "healthcare", health: "healthcare", medical: "healthcare", school: "open-book",
  shopping: "shopping-bag", flight: "airplane", travel: "airplane", trip: "airplane",
  plane: "airplane", holiday: "airplane", vacation: "beach-bag", focus: "star",
  reminder: "warning-triangle", video: "video-camera"
};
const calendarIconArt: Record<string, string> = {
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18"/>',
  "birthday-cake": '<path d="M4 21V11h16v10H4Zm0-6c3 4 5-4 8 0s5-4 8 0M8 11V7m8 4V7m-4 4V5M8 3v1m8-1v1m-4-3v1"/>',
  suitcase: '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v4M3 12h18m-11 0v3h2v-3"/>',
  healthcare: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z"/>',
  group: '<circle cx="9" cy="7" r="3"/><path d="M2 21v-4a7 7 0 0 1 14 0v4m0-17a3 3 0 0 1 0 6m3 3a5 5 0 0 1 3 5v3"/>',
  phone: '<path d="m5 3 4 4-2 3a17 17 0 0 0 7 7l3-2 4 4-3 3C9 20 4 15 2 6Z"/>',
  "shopping-bag": '<path d="M4 8h16l1 13H3ZM8 8V6a4 4 0 0 1 8 0v2"/>',
  airplane: '<path d="m3 10 7 2V3l2-2 2 2v9l7-2v3l-7 3v4l3 2H7l3-2v-4l-7-3Z"/>',
  "open-book": '<path d="M12 5v16M12 5C8 2 5 3 2 3v16c4-1 7 0 10 2 3-2 6-3 10-2V3c-3 0-6-1-10 2Z"/>',
  star: '<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>',
  "video-camera": '<rect x="2" y="5" width="14" height="14" rx="2"/><path d="m16 9 6-4v14l-6-4"/>',
  music: '<path d="M10 18V5l11-3v13M10 8l11-3"/><ellipse cx="6" cy="18" rx="4" ry="3"/><ellipse cx="17" cy="15" rx="4" ry="3"/>',
  coffee: '<path d="M3 8h14v7a7 7 0 0 1-14 0Zm14 0h2a3 3 0 0 1 0 6h-2M7 2v3m5-3v3M2 23h19"/>',
  bicycle: '<circle cx="5" cy="17" r="4"/><circle cx="19" cy="17" r="4"/><path d="m5 17 5-10 9 10H5m4-7h7m-3-6h3l3 13M8 7h4"/>'
};
const iconRules: [RegExp, string][] = [
  [/(?:^|[^\p{L}])(?:geburtstag|geburtstagsfeier|birthday)(?:$|[^\p{L}])/u, "birthday-cake"],
  [/(?:^|[^\p{L}])(?:zahnarzt|arzt|ärztin|arzttermin|dentist|doctor|physio|impfung|vaccination)(?:$|[^\p{L}])/u, "healthcare"],
  [/(?:^|[^\p{L}])(?:flug|flight|airport|flughafen)(?:$|[^\p{L}])/u, "airplane"],
  [/(?:^|[^\p{L}])(?:schule|school|elternabend|unterricht|kita)(?:$|[^\p{L}])/u, "open-book"],
  [/(?:^|[^\p{L}])(?:einkaufen|einkauf|shopping|wochenmarkt|supermarkt)(?:$|[^\p{L}])/u, "shopping-bag"],
  [/(?:^|[^\p{L}])(?:telefonat|anruf|call)(?:$|[^\p{L}])/u, "phone"],
  [/(?:^|[^\p{L}])(?:konzert|concert|jazz|chor|probe)(?:$|[^\p{L}])/u, "music"],
  [/(?:^|[^\p{L}])(?:kino|cinema|movie|filmabend|videokonferenz)(?:$|[^\p{L}])/u, "video-camera"],
  [/(?:^|[^\p{L}])(?:fahrrad|radtour|cycling|bicycle)(?:$|[^\p{L}])/u, "bicycle"],
  [/(?:^|[^\p{L}])(?:kaffee|coffee|frühstück|teamfrühstück|brunch)(?:$|[^\p{L}])/u, "coffee"],
  [/(?:^|[^\p{L}])(?:meeting|besprechung|standup|stand-up|teammeeting)(?:$|[^\p{L}])/u, "group"],
  [/(?:^|[^\p{L}])(?:arbeit|work|büro|office)(?:$|[^\p{L}])/u, "suitcase"]
];

function decorateCalendarEvent(event: CalendarEvent, settings: CalendarDisplaySettings): CalendarEvent {
  let tokenIcon = "";
  const strip = (value: unknown) => text(value).replace(/\[icon:([^\]\n]+)\]/gi, (_, name) => {
    tokenIcon ||= normalizeIconName(name);
    return "";
  }).trim();
  const isTask = event.kind === "task" || /\[todo\]/i.test(text(event.title) + " " + text(event.description));
  const title = strip(event.title).replace(/\[todo\]/gi, "").trim();
  strip(event.description);
  const explicit = normalizeIconName(event.iconName) || tokenIcon;
  const suggested = settings.automaticEventIcons
    ? iconRules.find(([pattern]) => pattern.test(title.toLocaleLowerCase(settings.locale)))?.[1] : "";
  return { ...event, title, ...(isTask ? { kind: "task" as const } : {}), iconName: explicit || suggested || "" };
}

function renderEventIcon(
  event: CalendarEvent,
  settings: CalendarDisplaySettings,
  aliases: Record<string, string>
): string {
  const iconName = normalizeIconName(event.iconName);
  if (!settings.showEventIcons || !iconName) {
    return "";
  }
  const iconClass = normalizeIconName(aliases[iconName] ?? calendarIconAliases[iconName] ?? iconName);
  const art = calendarIconArt[iconClass];
  if (art) return `<span class="pp-cal-event-icon" data-icon="${escapeHtml(iconClass)}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${art}</svg></span>`;
  return `<span class="pp-cal-event-icon" aria-hidden="true"><i class="iconoir-${escapeHtml(
    iconClass
  )}"></i></span>`;
}

function renderEventImage(event: CalendarEvent, settings: CalendarDisplaySettings): string {
  const imageUrl = settings.showEventImages ? safeImageUrl(event.imageUrl) : "";
  return imageUrl
    ? `<img class="pp-cal-event-image" src="${escapeHtml(
        imageUrl
      )}" alt="" loading="eager" decoding="async">`
    : "";
}

function visibleDetails(event: CalendarEvent): CalendarEventDetail[] {
  return (event.details || []).filter(
    (detail) => detail.visible !== false && (hasText(detail.label) || hasText(detail.value))
  );
}

function renderDetails(event: CalendarEvent): string {
  const details = visibleDetails(event);
  if (!details.length) {
    return "";
  }
  return `<dl class="pp-cal-event-details">${details
    .map((detail) => {
      const label = hasText(detail.label)
        ? `<dt class="pp-cal-event-detail-label">${escapeHtml(detail.label)}</dt>`
        : "";
      return `<div class="pp-cal-event-detail">${label}<dd class="pp-cal-event-detail-value">${escapeHtml(
        detail.value
      )}</dd></div>`;
    })
    .join("")}</dl>`;
}

const calendarColorCache = new Map<string, string>();

function calendarPaletteColor(value: unknown): string {
  if (typeof value !== "string") return "";
  const raw = value.trim().toLowerCase();
  if (calendarColorCache.has(raw)) return calendarColorCache.get(raw)!;
  let rgb: number[] | undefined;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(raw)?.[1];
  if (hex) {
    if ((hex.length === 4 && hex[3] === "0") || (hex.length === 8 && hex.slice(6) === "00")) return "";
    const full = hex.length <= 4 ? [...hex.slice(0, 3)].map((c) => c + c).join("") : hex.slice(0, 6);
    rgb = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  } else if (/^[a-z]{1,30}$/.test(raw) && !["transparent", "currentcolor", "inherit", "initial", "unset", "revert", "revert-layer"].includes(raw)) {
    // Resolve RFC 7986 CSS color names; never interpolate provider input into markup/CSS.
    const probe = document.createElement("span");
    probe.style.color = raw;
    if (probe.style.color) {
      document.body.append(probe);
      const computed = getComputedStyle(probe).color;
      probe.remove();
      const match = /^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/.exec(computed);
      if (match) rgb = match.slice(1).map(Number);
    }
  }
  let color = "";
  if (rgb) {
    const [red, green, blue] = rgb.map((channel) => channel / 255);
    const max = Math.max(red, green, blue), min = Math.min(red, green, blue), delta = max - min;
    if (!max || delta / max < 0.15) {
      color = min > 0.9 ? "white" : "black";
    } else {
      const hue = ((max === red ? (green - blue) / delta : max === green ? (blue - red) / delta + 2 : (red - green) / delta + 4) * 60 + 360) % 360;
      color = hue < 45 || hue >= 300 ? "red" : hue < 70 ? "yellow" : hue < 170 ? "green" : "blue";
    }
  }
  if (calendarColorCache.size >= 256) calendarColorCache.clear();
  calendarColorCache.set(raw, color);
  return color;
}

function calendarEventColors(event: CalendarEvent): { className: string; style: string } {
  const color = calendarPaletteColor(event.color) || calendarPaletteColor(event.calendarColor);
  if (!color) return { className: "", style: "" };
  const foreground = ["white", "yellow", "green"].includes(color) ? "black" : "white";
  return {
    className: `has-source-color pp-cal-event--color-${color}`,
    style: ` style="--pp-cal-event-bg:var(--pp-${color});--pp-cal-event-fg:var(--pp-${foreground})"`
  };
}

function renderEventCard(
  item: PreparedCalendarEvent,
  settings: CalendarDisplaySettings,
  messages: CalendarMessages,
  aliases: Record<string, string>,
  compact = false,
  showDetails = !compact
): string {
  const event = item.event;
  const colors = calendarEventColors(event);
  const title = hasText(event.title) ? event.title : messages.untitled;
  const location = settings.showLocation && hasText(event.location)
    ? `<p class="pp-cal-event-location">${escapeHtml(event.location)}</p>`
    : "";
  const details = showDetails ? renderDetails(event) : "";
  const classes = [
    "pp-cal-event",
    colors.className,
    compact ? "pp-cal-event--compact" : "",
    details ? "pp-cal-event--with-details" : ""
  ]
    .filter(Boolean)
    .join(" ");
  return `<article class="${classes}"${colors.style} data-date="${escapeHtml(item.dateKey)}">
    <p class="pp-cal-event-time">${escapeHtml(eventTimeText(event, settings, messages))}</p>
    <div class="pp-cal-event-content">
      <div class="pp-cal-event-heading">${renderEventIcon(event, settings, aliases)}<h2 class="pp-cal-event-title">${escapeHtml(
        title
      )}</h2></div>
      ${location}
      ${renderEventImage(event, settings)}
    </div>
    ${details}
  </article>`;
}

function eventsByDate(events: PreparedCalendarEvent[]): Map<string, PreparedCalendarEvent[]> {
  const result = new Map<string, PreparedCalendarEvent[]>();
  for (const event of events) {
    const bucket = result.get(event.dateKey) ?? [];
    bucket.push(event);
    result.set(event.dateKey, bucket);
  }
  return result;
}

function moreEventsLabel(template: string, count: number): string {
  return template.replace("{count}", String(count));
}

function dateHeader(dateKey: string, settings: CalendarDisplaySettings): string {
  const weekday = formatCivilDate(dateKey, settings.locale, { weekday: settings.fullWeekdayNames ? "long" : "short" });
  const date = formatCivilDate(dateKey, settings.locale, { month: "short", day: "numeric" });
  return `<span class="pp-cal-column-weekday">${escapeHtml(
    weekday
  )}</span><span class="pp-cal-column-date">${escapeHtml(date)}</span>`;
}

function renderAgenda(
  events: PreparedCalendarEvent[],
  settings: CalendarDisplaySettings,
  messages: CalendarMessages,
  aliases: Record<string, string>,
  todayKey: string
): string {
  const visible = events.slice(0, settings.maxEvents);
  const grouped = eventsByDate(visible);
  if (!visible.length) {
    return `<div class="pp-cal-empty">${escapeHtml(messages.empty)}</div>`;
  }
  const hidden = events.length - visible.length;
  return `<div class="pp-cal-agenda">${Array.from(grouped.entries())
    .map(([dateKey, items]) => {
      const classes = settings.highlightToday && dateKey === todayKey
        ? "pp-cal-day-group is-today"
        : "pp-cal-day-group";
      const weekday = formatCivilDate(dateKey, settings.locale, { weekday: "long" });
      const date = formatCivilDate(dateKey, settings.locale, { month: "long", day: "numeric" });
      return `<section class="${classes}"><h2 class="pp-cal-day-heading"><span class="pp-cal-day-weekday">${escapeHtml(
        weekday
      )}</span><span class="pp-cal-day-date">${escapeHtml(
        date
      )}</span></h2><div class="pp-cal-day-events">${items
        .map((item) => renderEventCard(item, settings, messages, aliases))
        .join("")}</div></section>`;
    })
    .join("")}${classicMore(messages, hidden)}</div>`;
}

function classicMore(messages: CalendarMessages, count: number): string {
  return `<p class="pp-cal-more" data-classic-more data-base-count="${count}" data-template="${escapeHtml(messages.moreEvents)}"${count ? "" : " hidden"}>${escapeHtml(moreEventsLabel(messages.moreEvents, count))}</p>`;
}

/** Opt-in editorial views share event formatting and timezone handling with the classic views. */
function renderModernDate(dateKey: string, settings: CalendarDisplaySettings, messages: CalendarMessages, todayKey: string): string {
  const relative = dateKey === todayKey ? messages.today
    : dateKey === addDaysToKey(todayKey, 1) ? messages.tomorrow : "";
  return `<header class="pp-cal-modern-date${dateKey === todayKey && settings.highlightToday ? " is-today" : ""}">
    <time datetime="${escapeHtml(dateKey)}" class="pp-cal-modern-number">${escapeHtml(formatCivilDate(dateKey, settings.locale, { day: "numeric" }))}</time>
    <div><p class="pp-cal-modern-relative">${escapeHtml(relative || formatCivilDate(dateKey, settings.locale, { month: "short" }))}</p>
    <p class="pp-cal-modern-weekday">${escapeHtml(formatCivilDate(dateKey, settings.locale, { weekday: "long" }))}</p>${settings.view === "today-next" && dateKey === todayKey ? `<p class="pp-cal-focus-month">${escapeHtml(formatCivilDate(dateKey, settings.locale, { month: "long", year: "numeric" }))}</p>` : ""}</div>
  </header>`;
}

function modernMore(messages: CalendarMessages, count: number): string {
  return `<p class="pp-cal-more pp-cal-modern-more" data-base-count="${count}" data-template="${escapeHtml(messages.moreEvents)}"${count ? "" : " hidden"}>${escapeHtml(moreEventsLabel(messages.moreEvents, count))}</p>`;
}

function renderModernAgenda(events: PreparedCalendarEvent[], settings: CalendarDisplaySettings, messages: CalendarMessages, aliases: Record<string, string>, todayKey: string): string {
  const visible = events.slice(0, settings.maxEvents);
  return `<section class="pp-cal-modern-list" data-modern-list>${visible.length ? Array.from(eventsByDate(visible), ([dateKey, items]) =>
    `<section class="pp-cal-modern-group">${renderModernDate(dateKey, settings, messages, todayKey)}<div class="pp-cal-modern-events">${items.map(item => renderEventCard(item, settings, messages, aliases)).join("")}</div></section>`
  ).join("") : `<p class="pp-cal-empty">${escapeHtml(messages.empty)}</p>`}${modernMore(messages, events.length - visible.length)}</section>`;
}

function renderTodayNext(events: PreparedCalendarEvent[], settings: CalendarDisplaySettings, messages: CalendarMessages, aliases: Record<string, string>, todayKey: string, now: Date): string {
  const today = events.filter(item => item.dateKey === todayKey);
  const later = events.filter(item => item.dateKey > todayKey);
  const featured = today.find(item => {
    if (!item.startDate) return false;
    const end = new Date(item.event.end?.dateTime || "").getTime();
    return (Number.isFinite(end) ? end : item.startDate.getTime() + 30 * 60_000) > now.getTime();
  });
  // Put the next/current timed appointment first; all-day and earlier entries remain below it.
  const remaining = today.filter(item => item !== featured);
  const isFinished = (item: PreparedCalendarEvent) => {
    if (!item.startDate) return false;
    const end = new Date(item.event.end?.dateTime || "").getTime();
    return (Number.isFinite(end) ? end : item.startDate.getTime() + 30 * 60_000) <= now.getTime();
  };
  const ordered = featured ? [featured, ...remaining.filter(item => !isFinished(item)), ...remaining.filter(isFinished)] : today;
  const visible = ordered.slice(0, settings.maxEvents);
  return `<div class="pp-cal-focus-layout"><section class="pp-cal-focus-today">
    ${renderModernDate(todayKey, settings, messages, todayKey)}
    <section class="pp-cal-modern-list pp-cal-focus-list" data-modern-list>${visible.length ? visible.map(item =>
      item === featured ? `<div class="pp-cal-featured"><p class="pp-cal-modern-relative">${escapeHtml(item.startDate!.getTime() <= now.getTime() ? messages.ongoing : messages.nextEvent)}</p>${renderEventCard(item, settings, messages, aliases)}</div>`
      : renderEventCard(item, settings, messages, aliases)).join("") : `<p class="pp-cal-empty">${escapeHtml(messages.empty)}</p>`}
      ${modernMore(messages, today.length - visible.length)}</section>
    </section><section class="pp-cal-focus-later"><h2 class="pp-cal-later-title">${escapeHtml(messages.later)}</h2>
    ${renderModernAgenda(later, settings, messages, aliases, todayKey)}</section></div>`;
}

function renderDayColumns(
  range: CalendarRange,
  events: PreparedCalendarEvent[],
  settings: CalendarDisplaySettings,
  messages: CalendarMessages,
  aliases: Record<string, string>,
  todayKey: string
): string {
  const grouped = eventsByDate(events);
  return `<section class="pp-cal-columns pp-cal-columns--${range.dateKeys.length}">${range.dateKeys
    .map((dateKey) => {
      const items = grouped.get(dateKey) || [];
      const visible = items.slice(0, settings.maxEvents);
      const hidden = items.length - visible.length;
      const classes = settings.highlightToday && dateKey === todayKey
        ? "pp-cal-column is-today"
        : "pp-cal-column";
      return `<section class="${classes}"><header class="pp-cal-column-heading">${dateHeader(
        dateKey,
        settings
      )}</header><div class="pp-cal-column-events">${
        visible.length
          ? `${visible
              .map((item) => renderEventCard(item, settings, messages, aliases, true, true))
              .join("")}${classicMore(messages, hidden)}`
          : `<div class="pp-cal-empty">${escapeHtml(messages.empty)}</div>`
      }</div></section>`;
    })
    .join("")}</section>`;
}

interface WeekSlot {
  item: PreparedCalendarEvent;
  start: number;
  end: number;
  lane: number;
  lanes: number;
}

function clockMinutes(date: Date, timeZone?: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    ...(timeZone ? { timeZone } : {})
  }).formatToParts(date);
  return Number(parts.find((part) => part.type === "hour")?.value || 0) * 60
    + Number(parts.find((part) => part.type === "minute")?.value || 0);
}

function weekSlot(item: PreparedCalendarEvent, settings: CalendarDisplaySettings): WeekSlot | null {
  if (hasText(item.event.start.date) || !item.startDate) return null;
  const zone = settings.timeZone ?? validTimeZone(item.event.start.timeZone);
  const start = dateKeyFromDate(item.startDate, zone) < item.dateKey
    ? 0 : clockMinutes(item.startDate, zone);
  const endDate = new Date(text(item.event.end?.dateTime));
  const validEnd = !Number.isNaN(endDate.getTime()) && endDate > item.startDate;
  const end = validEnd
    ? dateKeyFromDate(endDate, zone) > item.dateKey ? 1440 : clockMinutes(endDate, zone)
    : start + 30;
  // A wall-clock grid cannot express the repeated hour at the autumn DST transition.
  // Keep that occurrence visible even if its local end clock precedes its start clock.
  return { item, start, end: Math.min(1440, Math.max(start + 1, end)), lane: 0, lanes: 1 };
}

function positionWeekSlots<T extends { start: number; end: number; lane: number; lanes: number }>(slots: T[]): T[] {
  const sorted = [...slots].sort((a, b) => a.start - b.start || b.end - a.end);
  let group: T[] = [];
  let ends: number[] = [];
  let groupEnd = -1;
  const finish = () => group.forEach((slot) => { slot.lanes = ends.length; });
  for (const slot of sorted) {
    if (slot.start >= groupEnd) {
      finish();
      group = [];
      ends = [];
    }
    let lane = ends.findIndex((end) => end <= slot.start);
    if (lane < 0) lane = ends.length;
    ends[lane] = slot.end;
    slot.lane = lane;
    group.push(slot);
    groupEnd = Math.max(...ends);
  }
  finish();
  return sorted;
}

function renderWeek(
  range: CalendarRange,
  events: PreparedCalendarEvent[],
  settings: CalendarDisplaySettings,
  messages: CalendarMessages,
  aliases: Record<string, string>,
  todayKey: string
): string {
  const grouped = eventsByDate(events);
  const days = range.dateKeys.map((dateKey) => {
    const items = grouped.get(dateKey) || [];
    const visible = items.slice(0, settings.maxEvents);
    const slots = visible.map((item) => weekSlot(item, settings)).filter(
      (slot): slot is WeekSlot => slot !== null
    );
    return {
      dateKey,
      allDay: visible.filter((item) => !weekSlot(item, settings)),
      slots: positionWeekSlots(slots),
      hidden: items.length - visible.length
    };
  });
  const slots = settings.view === "rolling-week"
    ? events.map(item => weekSlot(item, settings)).filter((slot): slot is WeekSlot => slot !== null)
    : days.flatMap((day) => day.slots);
  const startHour = Math.max(0, Math.floor(Math.min(8 * 60, ...slots.map((slot) => slot.start)) / 60));
  const endHour = Math.min(24, Math.ceil(Math.max(18 * 60, ...slots.map((slot) => slot.end)) / 60));
  const minutes = (endHour - startHour) * 60;
  const hasAllDay = days.some((day) => day.allDay.length);
  const hasHidden = days.some((day) => day.hidden);
  const hourLabel = (hour: number) => new Intl.DateTimeFormat(settings.locale, {
    hour: "2-digit", minute: "2-digit", timeZone: "UTC"
  }).format(new Date(Date.UTC(2026, 0, 1, hour)));
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);
  const todayClass = (dateKey: string) => settings.highlightToday && dateKey === todayKey ? " is-today" : "";
  return `<section class="pp-cal-week" style="--pp-cal-hours:${endHour - startHour};--pp-cal-days:${days.length}">
    <div class="pp-cal-week-head"><div></div>${days.map(({ dateKey }) =>
      `<header class="pp-cal-week-heading${todayClass(dateKey)}">${settings.view === "rolling-week" ? rollingDayHeader(dateKey, settings, messages, todayKey) : dateHeader(dateKey, settings)}</header>`
    ).join("")}</div>
    ${hasAllDay ? `<div class="pp-cal-week-all-day"><span class="pp-cal-week-all-day-label">${escapeHtml(messages.allDay)}</span>${days.map((day) =>
      `<div class="pp-cal-week-all-day-events">${day.allDay.slice(0, 2).map((item) =>
        renderEventCard(item, settings, messages, aliases, true)
      ).join("")}${day.allDay.length > 2 ? `<span class="pp-cal-more">${escapeHtml(moreEventsLabel(messages.moreEvents, day.allDay.length - 2))}</span>` : ""}</div>`
    ).join("")}</div>` : ""}
    <div class="pp-cal-week-grid"><div class="pp-cal-week-hours">${hours.map((hour, index) =>
      `<span class="pp-cal-hour" style="top:${index / (endHour - startHour) * 100}%">${escapeHtml(hourLabel(hour))}</span>`
    ).join("")}</div>${days.map((day) =>
      `<section class="pp-cal-week-cell${todayClass(day.dateKey)}" data-date="${day.dateKey}">${hours.slice(0, -1).map((_hour, index) =>
        `<div class="pp-cal-hour-rule" style="top:${index / (endHour - startHour) * 100}%" aria-hidden="true"></div>`
      ).join("")}${day.slots.map((slot) => {
        const top = (slot.start - startHour * 60) / minutes * 100;
        const height = (slot.end - slot.start) / minutes * 100;
        return `<div title="${escapeHtml(eventTimeText(slot.item.event, settings, messages))} · ${escapeHtml(slot.item.event.title || messages.untitled)}" class="pp-cal-week-slot${slot.end - slot.start < 60 ? " is-short" : ""}${slot.end - slot.start < 30 ? " is-tiny" : ""}" data-start="${slot.start}" data-end="${slot.end}" data-lane="${slot.lane}" data-lanes="${slot.lanes}" style="top:${top}%;height:${height}%;left:${slot.lane / slot.lanes * 100}%;width:${100 / slot.lanes}%">${renderEventCard(slot.item, settings, messages, aliases, true)}</div>`;
      }).join("")}</section>`
    ).join("")}</div>
    ${hasHidden ? `<div class="pp-cal-week-overflow"><div></div>${days.map((day) => `<span class="pp-cal-more">${day.hidden ? escapeHtml(moreEventsLabel(messages.moreEvents, day.hidden)) : ""}</span>`).join("")}</div>` : ""}
  </section>`;
}

/** A single-day timeline, independently implemented from the visual reference. */
function renderDayTimeline(events: PreparedCalendarEvent[], settings: CalendarDisplaySettings, messages: CalendarMessages, aliases: Record<string, string>, todayKey: string, now: Date): string {
  const timed = events.filter(item => item.startDate && !hasText(item.event.start.date) && item.event.kind !== "task");
  const tasks = events.filter(item => item.event.kind === "task");
  const allDay = events.filter(item => hasText(item.event.start.date) && item.event.kind !== "task");
  const remaining = timed.filter(item => {
    const end = new Date(text(item.event.end?.dateTime));
    return item.startDate! >= now || (!Number.isNaN(end.getTime()) && end > now);
  });
  const next = remaining.find(item => item.startDate! > now) ?? remaining[0];
  const slots = timed.map(item => weekSlot(item, settings)!).filter(Boolean);
  const start = Math.max(0, Math.floor(Math.min(8 * 60, ...slots.map(slot => slot.start)) / 60) * 60);
  const end = Math.min(1440, Math.ceil(Math.max(18 * 60, ...slots.map(slot => slot.end)) / 60) * 60);
  const span = end - start;
  const percentage = (minute: number) => (minute - start) / span * 100;
  const hourLabel = (minute: number) => new Intl.DateTimeFormat(settings.locale, {hour:"2-digit",minute:"2-digit",timeZone:"UTC"}).format(new Date(Date.UTC(2026,0,1,0,minute)));
  const hours = Array.from({length:Math.floor(span / 60) + 1}, (_, i) => start + i * 60);
  const gaps: {start: number; end: number}[] = [];
  // Only known busy intervals establish free gaps; unknown ends and all-day entries make them uncertain.
  if (settings.timelineShowGaps && !allDay.length && timed.every(item => {
    const endDate = new Date(text(item.event.end?.dateTime));
    const slot = weekSlot(item,settings)!;
    return endDate > item.startDate! && Math.abs((endDate.getTime()-item.startDate!.getTime())/60000-(slot.end-slot.start))<1;
  })) {
    let previousEnd: number | undefined;
    for (const slot of [...slots].filter(slot => slot.item.event.busy !== false).sort((a,b) => a.start-b.start)) {
      if (previousEnd !== undefined && slot.start-previousEnd >= settings.timelineGapMinutes) gaps.push({start:previousEnd,end:slot.start});
      previousEnd = Math.max(previousEnd ?? 0,slot.end);
    }
  }
  const nowMinutes = clockMinutes(now, settings.timeZone);
  const sideRow = (item: PreparedCalendarEvent) => `<div class="pp-cal-timeline-side-row" data-timeline-row><div><p class="pp-cal-timeline-side-time">${escapeHtml(eventTimeText(item.event, settings, messages))}</p><p class="pp-cal-timeline-side-title">${escapeHtml(item.event.title || messages.untitled)}</p></div></div>`;
  const sideItems = [...tasks,...allDay];
  const visibleSide = sideItems.slice(0,settings.maxEvents);
  const overflow = timed.length-Math.min(timed.length,settings.maxEvents);
  return `<section class="pp-cal-timeline${settings.timelineShowSidebar ? "" : " pp-cal-timeline--wide"}">
    <header class="pp-cal-timeline-heading"><h1><strong>${escapeHtml(formatCivilDate(todayKey,settings.locale,{weekday:"long"}))}</strong> ${escapeHtml(formatCivilDate(todayKey,settings.locale,{day:"numeric",month:"long"}))}</h1><span>${escapeHtml(messages.timelineRemaining.replace("{count}",String(remaining.length)))}</span></header>
    <div class="pp-cal-timeline-main"><section class="pp-cal-timeline-day">
      ${!settings.timelineShowSidebar && sideItems.length ? `<div class="pp-cal-timeline-inline" data-timeline-list>${visibleSide.map(item => sideRow(item)).join("")}${modernMore(messages,sideItems.length-visibleSide.length)}</div>` : ""}
      <div class="pp-cal-timeline-grid" data-start="${start}" data-end="${end}">
        ${hours.map(minute=>`<div class="pp-cal-timeline-hour" style="top:${percentage(minute)}%"><span>${escapeHtml(hourLabel(minute))}</span></div>`).join("")}
        <div class="pp-cal-timeline-track">${gaps.map(gap=>`<div class="pp-cal-timeline-gap" style="top:${percentage((gap.start+gap.end)/2)}%"><span>${escapeHtml(messages.timelineGap.replace("{duration}",formatTimelineDuration(gap.end-gap.start,settings.locale)))}</span></div>`).join("")}
        ${slots.slice(0,settings.maxEvents).map(slot=> {
          const isNow = slot.item.startDate! <= now && new Date(text(slot.item.event.end?.dateTime)) > now;
          return `<div class="pp-cal-timeline-slot${isNow ? " is-current" : ""}" title="${escapeHtml(eventTimeText(slot.item.event,settings,messages))} · ${escapeHtml(slot.item.event.title || messages.untitled)}" data-start="${slot.start}" data-end="${slot.end}">${renderEventCard(slot.item,settings,messages,aliases,true,false)}</div>`;
        }).join("")}
        ${!timed.length ? `<p class="pp-cal-timeline-empty">${escapeHtml(messages.empty)}</p>` : ""}
        </div>
        ${settings.timelineShowNow && nowMinutes >= start && nowMinutes <= end ? `<div class="pp-cal-timeline-now" style="top:${percentage(nowMinutes)}%"><span>${escapeHtml(messages.ongoing)}</span></div>` : ""}
      </div><p class="pp-cal-more pp-cal-timeline-overflow" data-template="${escapeHtml(messages.moreEvents)}" data-base-count="${overflow}"${overflow ? "" : " hidden"}>${escapeHtml(moreEventsLabel(messages.moreEvents,overflow))}</p>
    </section>
    ${settings.timelineShowSidebar ? `<aside class="pp-cal-timeline-sidebar"><section class="pp-cal-timeline-next"><p class="pp-cal-timeline-label">${escapeHtml(next && next.startDate! <= now ? messages.ongoing : messages.nextEvent)}</p>${next ? `<p class="pp-cal-timeline-clock">${escapeHtml(formatTime(next.event.start,settings.locale,settings.timeZone))}</p>${renderEventCard(next,settings,messages,aliases,false,false)}` : `<p class="pp-cal-timeline-finished">${escapeHtml(messages.timelineFinished)}</p>`}</section>
      <section class="pp-cal-timeline-side-list" data-timeline-list><h2 class="pp-cal-timeline-label">${escapeHtml(tasks.length ? messages.timelineDue : messages.allDay)}</h2>${visibleSide.map(item => sideRow(item)).join("")}${!sideItems.length ? `<p class="pp-cal-timeline-none">${escapeHtml(messages.empty)}</p>` : ""}${modernMore(messages,sideItems.length-visibleSide.length)}</section></aside>` : ""}
    </div></section>`;
}

function formatTimelineDuration(minutes: number, locale: string): string {
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  const format = (value: number, unit: "hour" | "minute") => new Intl.NumberFormat(locale,{style:"unit",unit,unitDisplay:"short"}).format(value);
  return [hours ? format(hours,"hour") : "", rest ? format(rest,"minute") : ""].filter(Boolean).join(" ");
}

function fitDayTimeline(target: HTMLElement): void {
  const grid = target.querySelector<HTMLElement>(".pp-cal-timeline-grid");
  const track = target.querySelector<HTMLElement>(".pp-cal-timeline-track");
  if (!grid || !track || !grid.clientHeight) return;
  const scale = parseFloat(target.style.getPropertyValue("--pp-cal-font-scale")) || 1;
  const start = Number(grid.dataset.start), span = Number(grid.dataset.end)-start;
  const nodes = [...track.querySelectorAll<HTMLElement>(".pp-cal-timeline-slot")];
  const counter = target.querySelector<HTMLElement>(".pp-cal-timeline-overflow")!;
  counter.hidden = true;
  const minHeight = Math.min(grid.clientHeight,Math.max(26,Math.min(58,window.innerWidth*.04))*scale);
  const positioned = positionWeekSlots(nodes.map(node => {
    node.hidden = false;
    const height = Math.min(grid.clientHeight,Math.max(minHeight,(Number(node.dataset.end)-Number(node.dataset.start))/span*grid.clientHeight));
    const top = Math.min(grid.clientHeight-height,(Number(node.dataset.start)-start)/span*grid.clientHeight);
    return {node,start:top,end:top+height,lane:0,lanes:1};
  }));
  const maxLanes = Math.max(1, Math.floor(track.clientWidth/(110*scale)));
  let hidden = Number(counter.dataset.baseCount || 0);
  for (const slot of positioned) {
    if (slot.lane >= maxLanes) {slot.node.hidden=true;hidden++;continue;}
    const lanes=Math.min(slot.lanes,maxLanes);
    Object.assign(slot.node.style,{top:`${slot.start}px`,height:`${slot.end-slot.start}px`,left:`${slot.lane/lanes*100}%`,width:`${100/lanes}%`});
    slot.node.classList.toggle("is-short",slot.end-slot.start<48*scale);
    slot.node.classList.remove("hide-location","hide-time");
    const card=slot.node.querySelector<HTMLElement>(".pp-cal-event")!;
    const content=card.querySelector<HTMLElement>(".pp-cal-event-content")!;
    const time=card.querySelector<HTMLElement>(".pp-cal-event-time")!;
    const style=getComputedStyle(card);
    const required=() => (slot.node.classList.contains("is-short")
      ? Math.max(content.scrollHeight,time.offsetHeight)
      : content.scrollHeight+time.offsetHeight+(parseFloat(style.gap)||0))
      + (parseFloat(style.paddingTop)||0)+(parseFloat(style.paddingBottom)||0);
    if (required()>card.clientHeight+1) slot.node.classList.add("hide-location");
    if (required()>card.clientHeight+1) slot.node.classList.add("hide-time");
  }
  // The counter occupies a reserved footer, so toggling it cannot change grid geometry.
  counter.textContent=moreEventsLabel(counter.dataset.template || "",hidden);counter.hidden=!hidden;
  for (const gap of track.querySelectorAll<HTMLElement>(".pp-cal-timeline-gap")) {
    gap.hidden=false;
    const r=gap.getBoundingClientRect();
    if (nodes.some(node=>!node.hidden && node.getBoundingClientRect().bottom>r.top && node.getBoundingClientRect().top<r.bottom)) gap.hidden=true;
  }
  const hours=[...grid.querySelectorAll<HTMLElement>(".pp-cal-timeline-hour")];
  const stride=Math.max(span>600 ? 2 : 1,Math.ceil(26*scale/(grid.clientHeight/(hours.length-1))));
  hours.forEach((node,index)=>{node.hidden=index%stride!==0 && index!==hours.length-1;});
  const next=target.querySelector<HTMLElement>(".pp-cal-timeline-next");
  if (next) {
    next.style.fontSize="";next.classList.remove("is-tight");
    const max=parseFloat(getComputedStyle(next).fontSize);
    fitText(next,{min:max*.72,max,step:.5,tolerance:1});
    if (next.scrollHeight>next.clientHeight+1) {
      next.classList.add("is-tight");
      fitText(next,{min:max*.72,max,step:.5,tolerance:1});
    }
  }
  for (const list of target.querySelectorAll<HTMLElement>("[data-timeline-list]")) {
    const rows=[...list.querySelectorAll<HTMLElement>("[data-timeline-row]")];
    const more=list.querySelector<HTMLElement>(".pp-cal-modern-more")!;
    let count=Number(more.dataset.baseCount || 0);
    rows.forEach(row=>{row.hidden=false;});more.hidden=!count;
    for (const row of [...rows].reverse()) {
      if (list.scrollHeight<=list.clientHeight+1 && list.scrollWidth<=list.clientWidth+1) break;
      row.hidden=true;count++;more.hidden=false;more.textContent=moreEventsLabel(more.dataset.template || "",count);
    }
    more.textContent=moreEventsLabel(more.dataset.template || "",count);
  }
}

function rollingDayHeader(dateKey: string, settings: CalendarDisplaySettings, messages: CalendarMessages, todayKey: string): string {
  const dayName = dateKey === todayKey ? messages.today : formatCivilDate(dateKey, settings.locale, { weekday: settings.fullWeekdayNames ? "long" : "short" });
  return `<span class="pp-cal-column-weekday">${escapeHtml(dayName)}</span><time class="pp-cal-rolling-number" datetime="${dateKey}">${escapeHtml(formatCivilDate(dateKey, settings.locale, { day: "numeric" }))}</time>`;
}

function renderRollingWeek(range: CalendarRange, events: PreparedCalendarEvent[], settings: CalendarDisplaySettings, messages: CalendarMessages, aliases: Record<string, string>, todayKey: string): string {
  // Both responsive arrangements contain the same dates. CSS displays only one arrangement.
  return `<div class="pp-cal-rolling-grid-wide">${renderWeek(range, events, settings, messages, aliases, todayKey)}</div>
    <div class="pp-cal-rolling-grid-stacked">${[range.dateKeys.slice(0, 4), range.dateKeys.slice(4)].map(dateKeys => renderWeek({ ...range, dateKeys }, events, settings, messages, aliases, todayKey)).join("")}</div>`;
}

function renderRollingList(range: CalendarRange, events: PreparedCalendarEvent[], settings: CalendarDisplaySettings, messages: CalendarMessages, aliases: Record<string, string>, todayKey: string): string {
  const grouped = eventsByDate(events);
  return `<div class="pp-cal-rolling-list">${range.dateKeys.map(dateKey => {
    const items = grouped.get(dateKey) || [];
    const visible = items.slice(0, settings.maxEvents);
    return `<section class="pp-cal-rolling-day${dateKey === todayKey && settings.highlightToday ? " is-today" : ""}" data-date="${dateKey}">
      <header class="pp-cal-rolling-heading">${rollingDayHeader(dateKey, settings, messages, todayKey)}</header>
      <div class="pp-cal-rolling-events">${visible.length ? visible.map(item => renderEventCard(item, settings, messages, aliases, true, true)).join("") : `<p class="pp-cal-empty">${escapeHtml(messages.empty)}</p>`}${modernMore(messages, items.length - visible.length)}</div></section>`;
  }).join("")}</div>`;
}

function renderYear(
  range: CalendarRange,
  events: PreparedCalendarEvent[],
  settings: CalendarDisplaySettings,
  todayKey: string
): string {
  const grouped = eventsByDate(events);
  const year = Number(range.startKey.slice(0, 4));
  const weekdayKeys = Array.from({ length: 7 }, (_value, index) => addDaysToKey("2024-01-01", index));
  return `<section class="pp-cal-year">${Array.from({ length: 12 }, (_value, monthIndex) => {
    const monthStart = `${year}-${pad(monthIndex + 1)}-01`;
    const monthWeekday = dateKeyToUtcDate(monthStart).getUTCDay();
    const gridStart = addDaysToKey(monthStart, -((monthWeekday + 6) % 7));
    const days = Array.from({ length: 42 }, (_day, index) => addDaysToKey(gridStart, index));
    const monthName = formatCivilDate(monthStart, settings.locale, { month: "long" });
    return `<section class="pp-cal-month"><h2 class="pp-cal-month-heading">${escapeHtml(
      monthName
    )}</h2><div class="pp-cal-month-weekdays">${weekdayKeys
      .map(
        (dateKey) =>
          `<span>${escapeHtml(formatCivilDate(dateKey, settings.locale, { weekday: "narrow" }))}</span>`
      )
      .join("")}</div><div class="pp-cal-month-days">${days
      .map((dateKey) => {
        const count = (grouped.get(dateKey) || []).length;
        const classes = [
          "pp-cal-month-day",
          dateKey.slice(5, 7) !== pad(monthIndex + 1) ? "pp-cal-month-day--outside" : "",
          count > 0 ? "pp-cal-month-day--events" : "",
          settings.highlightToday && dateKey === todayKey ? "pp-cal-month-day--today" : ""
        ]
          .filter(Boolean)
          .join(" ");
        return `<span class="${classes}" title="${escapeHtml(String(count))}">${escapeHtml(
          String(Number(dateKey.slice(8, 10)))
        )}</span>`;
      })
      .join("")}</div></section>`;
  }).join("")}</section>`;
}

function renderHeader(header?: CalendarHeaderOptions): string {
  if (!header || !Object.values(header).some(hasText)) {
    return "";
  }
  return `<header class="pp-cal-header"><div class="pp-cal-header-main">${
    hasText(header.kicker)
      ? `<p class="pp-cal-kicker">${escapeHtml(header.kicker)}</p>`
      : ""
  }${
    hasText(header.title) ? `<h1 class="pp-cal-title">${escapeHtml(header.title)}</h1>` : ""
  }${
    hasText(header.subtitle)
      ? `<p class="pp-cal-subtitle">${escapeHtml(header.subtitle)}</p>`
      : ""
  }</div>${
    hasText(header.source)
      ? `<p class="pp-cal-source">${escapeHtml(header.source)}</p>`
      : ""
  }</header>`;
}

function renderDaySummary(
  events: PreparedCalendarEvent[], settings: CalendarDisplaySettings,
  messages: CalendarMessages, todayKey: string, now: Date
): string {
  if (!settings.showDaySummary) return "";
  const today = events.filter(item => item.dateKey === todayKey && (settings.view !== "day-timeline" || item.event.kind !== "task"));
  const allDay = today.filter(item => hasText(item.event.start.date)).length;
  const remaining = today.filter(item => {
    if (!item.startDate || hasText(item.event.start.date)) return false;
    const end = new Date(text(item.event.end?.dateTime));
    return Math.max(item.startDate.getTime(), Number.isNaN(end.getTime()) ? 0 : end.getTime()) > now.getTime()
      || item.startDate.getTime() === now.getTime();
  });
  const count = remaining.length;
  const parts = [count ? (count === 1 ? messages.remainingOne : messages.remainingMany.replace("{count}", String(count))) : messages.noMoreToday];
  if (allDay) parts.push(messages.allDayCount.replace("{count}", String(allDay)));
  const next = remaining[0];
  let detail = "";
  if (next) {
    const ongoing = next.startDate!.getTime() <= now.getTime();
    detail = `${ongoing ? messages.ongoing : messages.nextEvent} · ${formatTime(next.event.start, settings.locale, settings.timeZone)} · ${text(next.event.title) || messages.untitled}`;
  }
  const ends = remaining.map(item => new Date(text(item.event.end?.dateTime)));
  if (count && !allDay && ends.every((end, i) => !Number.isNaN(end.getTime()) && end > remaining[i].startDate! && dateKeyFromDate(end, settings.timeZone) === todayKey)) {
    const last = new Date(Math.max(...ends.map(end => end.getTime())));
    parts.push(messages.freeAfter.replace("{time}", formatTime({ dateTime: last.toISOString() }, settings.locale, settings.timeZone)));
  }
  const stamp = messages.asOf.replace("{time}", formatTime({ dateTime: now.toISOString() }, settings.locale, settings.timeZone));
  return `<aside class="pp-cal-day-summary"><div class="pp-cal-summary-heading"><strong>${escapeHtml(messages.dayAtGlance)}</strong><span>${escapeHtml(stamp)}</span></div><p class="pp-cal-summary-count">${escapeHtml(parts.join(" · "))}</p>${detail ? `<p class="pp-cal-summary-next">${escapeHtml(detail)}</p>` : ""}</aside>`;
}

function renderTodayBanner(
  settings: CalendarDisplaySettings,
  messages: CalendarMessages,
  todayKey: string
): string {
  if (!settings.highlightToday) {
    return "";
  }
  const weekday = formatCivilDate(todayKey, settings.locale, { weekday: "long" });
  const date = formatCivilDate(todayKey, settings.locale, { month: "long", day: "numeric" });
  return `<section class="pp-cal-today" style="--pp-cal-highlight-scale:${escapeHtml(
    settings.highlightScale
  )}"><span class="pp-cal-today-label">${escapeHtml(
    messages.today
  )}</span><span class="pp-cal-today-weekday">${escapeHtml(
    weekday
  )}</span><time datetime="${escapeHtml(todayKey)}">${escapeHtml(date)}</time></section>`;
}

const calendarEpdOverrides = new WeakMap<Document, { meta: HTMLMetaElement; original: string | null }>();

function preserveCalendarPigments(enabled: boolean): void {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="paperless:epd-optimize"]');
  let previous = calendarEpdOverrides.get(document);
  if (previous && previous.meta !== meta) {
    calendarEpdOverrides.delete(document);
    previous = undefined;
  }
  if (!enabled) {
    if (previous) {
      if (previous.original === null) previous.meta.remove();
      else previous.meta.content = previous.original;
      calendarEpdOverrides.delete(document);
    }
    return;
  }
  const original = previous ? previous.original : meta?.getAttribute("content") ?? null;
  let settings: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(original || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) settings = parsed as Record<string, unknown>;
  } catch { /* Use the calendar defaults when an existing meta value is malformed. */ }
  if (settings.enabled === false) return;
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "paperless:epd-optimize";
    document.head.append(meta);
  }
  if (!previous) calendarEpdOverrides.set(document, { meta, original });
  // Color-coded interface blocks already use native pigment RGB values. A photo-oriented
  // measured palette can quantize their bright green to yellow instead of the green pigment.
  meta.content = JSON.stringify({
    ...settings,
    intent: settings.intent || "readable",
    palette: "spectra6OriginalPalette",
    canvasDitherOptions: {
      ...(settings.canvasDitherOptions && typeof settings.canvasDitherOptions === "object" ? settings.canvasDitherOptions : {}),
      ditheringType: "errorDiffusion"
    }
  });
}

export function renderCalendarLayout(
  options: RenderCalendarLayoutOptions
): CalendarLayoutElements {
  const target = resolveTarget(options.target);
  const settings = normalizeCalendarSettings(options.settings);
  const messages = { ...DEFAULT_CALENDAR_MESSAGES, ...options.messages };
  const now = normalizeNow(options.now);
  const range = buildCalendarRange(settings, now);
  const events = prepareCalendarEvents((options.events || []).map(event => decorateCalendarEvent(event, settings)), settings, now);
  const todayKey = dateKeyFromDate(now, settings.timeZone);
  const aliases = options.iconAliases || {};

  target.classList.add("pp-screen", "pp-cal-screen");
  target.classList.remove(...VIEW_CLASSES);
  target.classList.add(`pp-cal--view-${settings.view}`);
  target.dataset.informationDensity = settings.informationDensity;
  target.dataset.calendarFontScale = String(settings.fontSize / 100);
  target.style.setProperty("--pp-cal-font-scale", String(settings.fontSize / 100));
  target.classList.toggle("pp-cal--personal-header", Boolean(settings.showHeader && (settings.personalTitle || settings.personalSubtitle)));
  target.classList.toggle("pp-cal--no-padding", settings.noPadding);
  target.classList.toggle("pp-cal--full-weekdays", settings.fullWeekdayNames);
  if (options.className) {
    target.classList.add(...options.className.split(/\s+/).filter(Boolean));
  }

  const modern = settings.view === "agenda-modern" || settings.view === "today-next";
  target.classList.toggle("pp-cal--modern", modern);
  const rolling = settings.view === "rolling-week" || settings.view === "rolling-week-list";
  target.classList.toggle("pp-cal--rolling", rolling);
  let content: string;
  switch (settings.view) {
    case "day-timeline":
      content = renderDayTimeline(events, settings, messages, aliases, todayKey, now);
      break;
    case "rolling-week":
      content = renderRollingWeek(range, events, settings, messages, aliases, todayKey);
      break;
    case "rolling-week-list":
      content = renderRollingList(range, events, settings, messages, aliases, todayKey);
      break;
    case "today-next":
      content = renderTodayNext(events, settings, messages, aliases, todayKey, now);
      break;
    case "agenda-modern":
      content = renderModernAgenda(events, settings, messages, aliases, todayKey);
      break;
    case "year":
      content = renderYear(range, events, settings, todayKey);
      break;
    case "week":
      content = renderWeek(range, events, settings, messages, aliases, todayKey);
      break;
    case "day":
    case "three-days":
      content = renderDayColumns(range, events, settings, messages, aliases, todayKey);
      break;
    default:
      content = renderAgenda(events, settings, messages, aliases, todayKey);
  }

  const week = settings.view === "week";
  const header = settings.showHeader ? {
    ...options.header,
    ...(settings.personalTitle ? { title: settings.personalTitle, kicker: "" } : {}),
    ...(settings.personalSubtitle ? { subtitle: settings.personalSubtitle } : {})
  } : undefined;
  target.innerHTML = `<section class="pp-cal-shell">${renderHeader(header)}${renderDaySummary(events, settings, messages, todayKey, now)}${week || modern || rolling || settings.view === "day-timeline" ? "" : renderTodayBanner(
    settings,
    messages,
    todayKey
  )}<section class="pp-cal-body">${week || settings.view === "today-next" || settings.view === "day-timeline" ? "" : `<h1 class="pp-cal-range-title">${escapeHtml(
    formatRangeTitle(range, settings)
  )}</h1>`}<div class="pp-cal-content pp-fit">${content}</div></section></section>`;

  preserveCalendarPigments((week || modern || rolling || settings.view === "day-timeline") && Boolean(target.querySelector(".has-source-color")));

  const shell = target.querySelector<HTMLElement>(".pp-cal-shell");
  const body = target.querySelector<HTMLElement>(".pp-cal-content");
  if (!shell || !body) {
    throw new Error("Could not render calendar layout.");
  }

  return { target, shell, body, settings, events, range };
}

// Preserve readable short appointments without allowing their minimum visual height to
// cover a neighboring appointment. Recompute lanes using the actual pixel intervals.
function fitWeekGrid(target: HTMLElement): void {
  for (const grid of target.querySelectorAll<HTMLElement>(".pp-cal-week-grid")) {
    if (grid.clientHeight <= 0) continue;
    const fontScale = parseFloat(target.style.getPropertyValue("--pp-cal-font-scale")) || 1;
    const rolling = target.classList.contains("pp-cal--view-rolling-week");
    const minimumHeight = (rolling ? Math.min(52, Math.max(32, window.innerWidth * 0.033)) : Math.min(24, Math.max(16, window.innerWidth * 0.024))) * fontScale;
    for (const column of grid.querySelectorAll<HTMLElement>(".pp-cal-week-cell")) {
      const nodes = Array.from(column.querySelectorAll<HTMLElement>(".pp-cal-week-slot"));
      const positioned = nodes.map((node) => {
        // Store the original proportional geometry so repeated fitting is idempotent.
        node.dataset.top ??= node.style.top;
        node.dataset.height ??= node.style.height;
        const height = Math.min(grid.clientHeight, Math.max(minimumHeight,
          parseFloat(node.dataset.height) / 100 * grid.clientHeight));
        const start = Math.min(grid.clientHeight - height,
          parseFloat(node.dataset.top) / 100 * grid.clientHeight);
        return { item: node, start, end: start + height, lane: 0, lanes: 1 };
      });
      // The overlap algorithm only needs start/end/lane fields.
      const slots = positionWeekSlots(positioned);
      for (const slot of slots) {
        const node = slot.item;
        node.style.top = `${slot.start / grid.clientHeight * 100}%`;
        node.style.height = `${(slot.end - slot.start) / grid.clientHeight * 100}%`;
        node.style.left = `${slot.lane / slot.lanes * 100}%`;
        node.style.width = `${100 / slot.lanes}%`;
        node.classList.toggle("is-compact", slot.end - slot.start < (rolling ? 28 : 36) * fontScale);
        node.classList.remove("hide-time");
        const card = node.querySelector<HTMLElement>(".pp-cal-event")!;
        const content = node.querySelector<HTMLElement>(".pp-cal-event-content")!;
        const time = node.querySelector<HTMLElement>(".pp-cal-event-time")!;
        const style = getComputedStyle(card);
        const requiredHeight = content.scrollHeight + time.offsetHeight
          + parseFloat(style.paddingTop || "0") + parseFloat(style.paddingBottom || "0")
          + (parseFloat(style.gap) || 0) + 3;
        node.classList.toggle("hide-time", requiredHeight > card.clientHeight);
      }
    }
  }
}

function fitModernCalendar(target: HTMLElement): void {
  const scale = parseFloat(target.style.getPropertyValue("--pp-cal-font-scale")) || 1;
  const body = target.querySelector<HTMLElement>(".pp-cal-content");
  if (!body) return;
  const base = Math.min(30, Math.max(22, window.innerWidth * 0.028)) * scale;
  body.style.fontSize = `${base}px`;
  if (target.dataset.informationDensity === "automatic") {
    target.querySelectorAll<HTMLElement>(".pp-cal-event, .pp-cal-modern-group, .pp-cal-featured").forEach(node => { node.hidden = false; });
    target.querySelectorAll<HTMLElement>(".pp-cal-modern-more").forEach(node => { node.hidden = !Number(node.dataset.baseCount || 0); });
    for (const list of target.querySelectorAll<HTMLElement>("[data-modern-list]")) {
      fitText(list, { min: base * .88, max: base * 1.12, step: .5, tolerance: 1 });
    }
  } else {
    target.querySelectorAll<HTMLElement>("[data-modern-list]").forEach(node => { node.style.fontSize = ""; });
  }
  for (const list of target.querySelectorAll<HTMLElement>("[data-modern-list]")) {
    const cards = Array.from(list.querySelectorAll<HTMLElement>(".pp-cal-event"));
    const groups = Array.from(list.querySelectorAll<HTMLElement>(".pp-cal-modern-group"));
    const counter = list.querySelector<HTMLElement>(".pp-cal-modern-more")!;
    cards.forEach(card => { card.hidden = false; });
    groups.forEach(group => { group.hidden = false; });
    let hidden = Number(counter.dataset.baseCount || 0);
    const update = () => {
      counter.hidden = hidden === 0;
      counter.textContent = moreEventsLabel(counter.dataset.template || "", hidden);
      groups.forEach(group => { group.hidden = !group.querySelector(".pp-cal-event:not([hidden])"); });
    };
    update();
    while (list.scrollHeight > list.clientHeight + 1 || list.scrollWidth > list.clientWidth + 1) {
      // Retain the featured appointment as long as possible.
      const card = [...cards].reverse().find(card => !card.hidden && !card.closest(".pp-cal-featured"))
        || [...cards].reverse().find(card => !card.hidden);
      if (!card) break;
      card.hidden = true;
      const featured = card.closest<HTMLElement>(".pp-cal-featured");
      if (featured) featured.hidden = true;
      hidden += 1;
      update();
    }
  }
}

function fitRollingList(target: HTMLElement): void {
  for (const list of target.querySelectorAll<HTMLElement>(".pp-cal-rolling-events")) {
    const cards = Array.from(list.querySelectorAll<HTMLElement>(".pp-cal-event"));
    const counter = list.querySelector<HTMLElement>(".pp-cal-modern-more")!;
    cards.forEach(card => { card.hidden = false; });
    counter.hidden = !Number(counter.dataset.baseCount || 0);
    list.style.fontSize = "";
    if (target.dataset.informationDensity === "automatic") {
      const base = parseFloat(getComputedStyle(list).fontSize);
      fitText(list, { min: base * .88, max: base * 1.12, step: .5, tolerance: 1 });
    }
    let hidden = Number(counter.dataset.baseCount || 0);
    const update = () => {
      counter.hidden = hidden === 0;
      counter.textContent = moreEventsLabel(counter.dataset.template || "", hidden);
    };
    update();
    while (list.scrollHeight > list.clientHeight + 1 || list.scrollWidth > list.clientWidth + 1) {
      const card = [...cards].reverse().find(card => !card.hidden);
      if (!card) break;
      card.hidden = true;
      hidden += 1;
      update();
    }
  }
}

const weekResizeObservers = new WeakMap<HTMLElement, ResizeObserver>();

export function fitCalendarLayout(
  layoutOrTarget: CalendarLayoutElements | HTMLElement | string,
  options: FitCalendarLayoutOptions = {}
): void {
  const target =
    typeof layoutOrTarget === "string" || layoutOrTarget instanceof HTMLElement
      ? resolveTarget(layoutOrTarget)
      : layoutOrTarget.target;
  const density = target.dataset.informationDensity || "comfortable";
  const factor = density === "compact" ? .88 : density === "spacious" ? 1.12 : 1;
  target.style.setProperty("--pp-cal-font-scale", String((Number(target.dataset.calendarFontScale) || 1) * factor));
  const body = target.querySelector<HTMLElement>(".pp-cal-content");
  // Shared fitting keeps long personal headings inside their allotted header area.
  for (const node of target.querySelectorAll<HTMLElement>(".pp-cal-title, .pp-cal-subtitle")) {
    node.style.fontSize = "";
    const max = parseFloat(getComputedStyle(node).fontSize);
    fitText(node, { min: max * .7, max, step: .5, tolerance: 1 });
  }
  const view = VIEW_CLASSES.find((className) => target.classList.contains(className));
  const defaults = view === "pp-cal--view-year"
    ? { min: 5, max: 12 }
    : { min: 9, max: 17 };

  weekResizeObservers.get(target)?.disconnect();
  weekResizeObservers.delete(target);
  if (view === "pp-cal--view-day-timeline") {
    fitDayTimeline(target);
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => fitDayTimeline(target));
      observer.observe(target);
      weekResizeObservers.set(target, observer);
    }
    return;
  }
  if (target.classList.contains("pp-cal--modern")) {
    target.querySelectorAll<HTMLElement>(".pp-cal-featured").forEach(node => { node.hidden = false; });
    fitModernCalendar(target);
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => {
        target.querySelectorAll<HTMLElement>(".pp-cal-featured").forEach(node => { node.hidden = false; });
        fitModernCalendar(target);
      });
      observer.observe(target);
      weekResizeObservers.set(target, observer);
    }
    return;
  }
  if (view === "pp-cal--view-rolling-week-list") {
    fitRollingList(target);
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => fitRollingList(target));
      observer.observe(target);
      weekResizeObservers.set(target, observer);
    }
    return;
  }
  if (view === "pp-cal--view-week" || view === "pp-cal--view-rolling-week") {
    fitWeekGrid(target);
    const grids = target.querySelectorAll<HTMLElement>(".pp-cal-week-grid");
    if (grids.length && typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => fitWeekGrid(target));
      grids.forEach(grid => observer.observe(grid));
      weekResizeObservers.set(target, observer);
    }
    return;
  }
  const fontScale = parseFloat(target.style.getPropertyValue("--pp-cal-font-scale")) || 1;
  if (body) {
    const fit = () => {
      const cards = Array.from(body.querySelectorAll<HTMLElement>(".pp-cal-event"));
      const groups = Array.from(body.querySelectorAll<HTMLElement>(".pp-cal-day-group"));
      const counters = Array.from(body.querySelectorAll<HTMLElement>("[data-classic-more]"));
      const counts = new Map(counters.map(node => [node, Number(node.dataset.baseCount || 0)]));
      cards.forEach(node => { node.hidden = false; });
      groups.forEach(node => { node.hidden = false; });
      const update = () => {
        for (const [node, count] of counts) {
          node.hidden = count === 0;
          node.textContent = moreEventsLabel(node.dataset.template || "", count);
        }
        groups.forEach(group => { group.hidden = !group.querySelector(".pp-cal-event:not([hidden])"); });
      };
      update();
      fitText(body, {
        min: (options.min ?? (density === "automatic" && view !== "pp-cal--view-year" ? 14 : defaults.min)) * fontScale,
        max: (options.max ?? defaults.max) * fontScale * (density === "automatic" ? 1.12 : 1),
        step: options.step ?? .5,
        tolerance: options.tolerance ?? 2
      });
      while (counters.length && (body.scrollHeight > body.clientHeight + 1 || body.scrollWidth > body.clientWidth + 1)) {
        // Trim the overflowing column first; do not discard another day's visible appointments.
        const card = cards.filter(node => !node.hidden).sort((a,b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0];
        if (!card) break;
        const counter = card.closest(".pp-cal-column")?.querySelector<HTMLElement>("[data-classic-more]") ?? counters[0];
        card.hidden = true;
        counts.set(counter, (counts.get(counter) || 0) + 1);
        update();
      }
    };
    fit();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(fit);
      observer.observe(target);
      weekResizeObservers.set(target, observer);
    }
  }
  if (options.fitScreen !== false) {
    fitToScreen(target, { padding: options.screenPadding ?? 0 });
  }
}

export function waitForCalendarImages(
  layoutOrRoot: CalendarLayoutElements | HTMLElement | string,
  timeoutMs = 5_000
): Promise<void> {
  const root =
    typeof layoutOrRoot === "string" || layoutOrRoot instanceof HTMLElement
      ? resolveTarget(layoutOrRoot)
      : layoutOrRoot.target;
  const images = Array.from(root.querySelectorAll<HTMLImageElement>(".pp-cal-event-image"));
  const pending = images.filter((image) => !image.complete);
  if (!pending.length) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let remaining = pending.length;
    const timeout = window.setTimeout(resolve, timeoutMs);
    const settle = () => {
      remaining -= 1;
      if (remaining <= 0) {
        window.clearTimeout(timeout);
        resolve();
      }
    };
    for (const image of pending) {
      image.addEventListener("load", settle, { once: true });
      image.addEventListener("error", settle, { once: true });
    }
  });
}
