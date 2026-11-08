import ICAL from "ical.js";

import type { CalendarDateValue, CalendarEvent } from "./calendar";

type IcalComponent = InstanceType<typeof ICAL.Component>;
type IcalEvent = InstanceType<typeof ICAL.Event>;
type IcalTime = InstanceType<typeof ICAL.Time>;
type IcalTimezone = InstanceType<typeof ICAL.Timezone>;
type IcalOccurrenceDetails = ReturnType<IcalEvent["getOccurrenceDetails"]>;

export type ICalendarRangeValue = Date | string | number;

export interface ParseICalendarOptions {
  /** Inclusive start of the requested range. Date-only strings are civil dates in `timeZone`. */
  rangeStart: ICalendarRangeValue;
  /** Exclusive end of the requested range. Date-only strings are civil dates in `timeZone`. */
  rangeEndExclusive: ICalendarRangeValue;
  /** IANA timezone used for civil range boundaries, floating values, and normalized output. */
  timeZone: string;
  /** Maximum number of source VEVENT components accepted from one calendar. */
  maxEvents?: number;
  /** Maximum number of recurrence candidates evaluated for one parse operation. */
  maxOccurrences?: number;
}

export const DEFAULT_ICAL_EVENT_LIMIT = 5_000;
export const DEFAULT_ICAL_OCCURRENCE_LIMIT = 50_000;
export const HARD_ICAL_EVENT_LIMIT = 20_000;
export const HARD_ICAL_OCCURRENCE_LIMIT = 100_000;

export type ICalendarLimitCode = "ICAL_EVENT_LIMIT" | "ICAL_OCCURRENCE_LIMIT";

export class ICalendarLimitError extends Error {
  readonly code: ICalendarLimitCode;
  readonly limit: number;

  constructor(code: ICalendarLimitCode, limit: number) {
    const subject = code === "ICAL_EVENT_LIMIT" ? "VEVENT components" : "occurrences";
    super(`iCalendar exceeds the configured limit of ${limit} ${subject}`);
    this.name = "ICalendarLimitError";
    this.code = code;
    this.limit = limit;
  }
}

export class ICalendarParseError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "ICalendarParseError";
    this.cause = cause;
  }
}

interface CivilDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

interface EventGroup {
  key: string;
  uid: string;
  master: IcalComponent | null;
  exceptions: IcalComponent[];
  sourceIndex: number;
}

interface NormalizedOccurrence {
  event: CalendarEvent;
  startTime: number;
}

interface RegisteredTimezone {
  tzid: string;
  previous: IcalTimezone | undefined;
}

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;
const EXPLICIT_OFFSET_PATTERN = /(?:Z|[+-]\d{2}:?\d{2})$/i;
const UTC_TIMEZONE_IDS = new Set(["Etc/GMT", "Etc/UTC", "GMT", "UTC", "Z"]);
const FLOATING_TIMEZONE_IDS = new Set(["floating", "local"]);
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function asPositiveLimit(
  value: number | undefined,
  fallback: number,
  hardLimit: number,
  name: string
): number {
  if (value === undefined) {
    return fallback;
  }
  if (!Number.isSafeInteger(value) || value < 1 || value > hardLimit) {
    throw new RangeError(`${name} must be an integer between 1 and ${hardLimit}`);
  }
  return value;
}

function assertTimeZone(timeZone: string): string {
  const normalized = String(timeZone || "").trim();
  if (!normalized) {
    throw new RangeError("timeZone is required");
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: normalized }).format(0);
  } catch (error) {
    throw new RangeError(`Invalid IANA timezone: ${normalized}`, { cause: error });
  }
  return normalized;
}

function isValidCivilDate(parts: CivilDateTime): boolean {
  const probe = new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      parts.millisecond
    )
  );
  return (
    probe.getUTCFullYear() === parts.year &&
    probe.getUTCMonth() + 1 === parts.month &&
    probe.getUTCDate() === parts.day &&
    probe.getUTCHours() === parts.hour &&
    probe.getUTCMinutes() === parts.minute &&
    probe.getUTCSeconds() === parts.second &&
    probe.getUTCMilliseconds() === parts.millisecond
  );
}

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      calendar: "gregory",
      numberingSystem: "latn",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

function instantCivilParts(timestamp: number, timeZone: string): CivilDateTime {
  const values: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const part of formatterFor(timeZone).formatToParts(new Date(timestamp))) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
    millisecond: 0
  };
}

/** Convert wall-clock parts in an IANA timezone to an absolute Unix timestamp. */
function civilDateTimeToEpoch(parts: CivilDateTime, timeZone: string): number {
  if (!isValidCivilDate(parts)) {
    throw new RangeError("Invalid civil date/time");
  }

  const desiredAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    0
  );
  let candidate = desiredAsUtc;

  // Offset iteration avoids depending on the process timezone and works across DST changes.
  for (let index = 0; index < 6; index += 1) {
    const actual = instantCivilParts(candidate, timeZone);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
      0
    );
    const correction = desiredAsUtc - actualAsUtc;
    if (correction === 0) {
      return candidate + parts.millisecond;
    }
    candidate += correction;
  }

  // Non-existent local times around a DST jump have no exact solution. Returning the normalized
  // candidate matches calendar-client behavior while keeping the conversion deterministic.
  return candidate + parts.millisecond;
}

function parseCivilString(value: string): CivilDateTime | null {
  const dateMatch = DATE_ONLY_PATTERN.exec(value);
  if (dateMatch) {
    return {
      year: Number(dateMatch[1]),
      month: Number(dateMatch[2]),
      day: Number(dateMatch[3]),
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0
    };
  }

  const dateTimeMatch = LOCAL_DATE_TIME_PATTERN.exec(value);
  if (!dateTimeMatch) {
    return null;
  }
  return {
    year: Number(dateTimeMatch[1]),
    month: Number(dateTimeMatch[2]),
    day: Number(dateTimeMatch[3]),
    hour: Number(dateTimeMatch[4]),
    minute: Number(dateTimeMatch[5]),
    second: Number(dateTimeMatch[6] || 0),
    millisecond: Number(String(dateTimeMatch[7] || "").padEnd(3, "0") || 0)
  };
}

function rangeValueToEpoch(value: ICalendarRangeValue, timeZone: string, name: string): number {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    if (!Number.isNaN(timestamp)) {
      return timestamp;
    }
    throw new RangeError(`${name} is an invalid Date`);
  }

  if (typeof value === "number") {
    if (Number.isFinite(value)) {
      return value;
    }
    throw new RangeError(`${name} must be a finite timestamp`);
  }

  const source = String(value).trim();
  const civil = parseCivilString(source);
  if (civil) {
    return civilDateTimeToEpoch(civil, timeZone);
  }
  if (EXPLICIT_OFFSET_PATTERN.test(source)) {
    const timestamp = new Date(source).getTime();
    if (!Number.isNaN(timestamp)) {
      return timestamp;
    }
  }
  throw new RangeError(
    `${name} must be a Date, Unix timestamp, ISO date, or ISO date-time with an offset`
  );
}

function stringProperty(component: IcalComponent, name: string): string {
  const value = component.getFirstPropertyValue(name);
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function propertyTimeZone(component: IcalComponent, name: string): string | undefined {
  const parameter = component.getFirstProperty(name)?.getParameter("tzid");
  const value = Array.isArray(parameter) ? parameter[0] : parameter;
  const normalized = String(value || "").trim();
  return normalized || undefined;
}

function timeZoneFromTime(time: IcalTime | null | undefined): string | undefined {
  const tzid = String(time?.zone?.tzid || "").trim();
  return tzid && !FLOATING_TIMEZONE_IDS.has(tzid) ? tzid : undefined;
}

function isIanaTimeZone(value: string | undefined): value is string {
  if (!value) {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

function timeToCivilParts(time: IcalTime): CivilDateTime {
  return {
    year: time.year,
    month: time.month,
    day: time.day,
    hour: time.isDate ? 0 : time.hour,
    minute: time.isDate ? 0 : time.minute,
    second: time.isDate ? 0 : time.second,
    millisecond: 0
  };
}

function timeToEpoch(time: IcalTime, propertyTzid: string | undefined, outputTimeZone: string): number {
  const parts = timeToCivilParts(time);
  if (time.isDate) {
    return civilDateTimeToEpoch(parts, outputTimeZone);
  }

  const resolvedTzid = timeZoneFromTime(time);
  const tzid = propertyTzid || resolvedTzid;
  if (resolvedTzid && UTC_TIMEZONE_IDS.has(resolvedTzid)) {
    return Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );
  }
  if (tzid && UTC_TIMEZONE_IDS.has(tzid)) {
    return Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );
  }

  // Prefer an authoritative VTIMEZONE bundled in the feed, including when its identifier also
  // happens to be recognized by the host's Intl implementation.
  if (
    resolvedTzid &&
    time.zone !== ICAL.Timezone.localTimezone &&
    time.zone !== ICAL.Timezone.utcTimezone
  ) {
    const timestamp = time.toUnixTime() * 1_000;
    if (Number.isFinite(timestamp)) {
      return timestamp;
    }
  }
  if (isIanaTimeZone(tzid)) {
    return civilDateTimeToEpoch(parts, tzid);
  }

  // RFC 5545 floating values intentionally inherit the consumer's timezone. Unknown TZIDs use the
  // same fallback rather than depending on the host process timezone.
  return civilDateTimeToEpoch(parts, outputTimeZone);
}

function dateKey(time: IcalTime): string {
  return `${String(time.year).padStart(4, "0")}-${String(time.month).padStart(2, "0")}-${String(
    time.day
  ).padStart(2, "0")}`;
}

function calendarDateValue(
  time: IcalTime,
  epoch: number,
  outputTimeZone: string
): CalendarDateValue {
  if (time.isDate) {
    return { date: dateKey(time) };
  }
  return {
    dateTime: new Date(epoch).toISOString(),
    timeZone: outputTimeZone
  };
}

function eventStatus(event: IcalEvent | IcalComponent): string {
  const component = event instanceof ICAL.Event ? event.component : event;
  return stringProperty(component, "status").trim().toUpperCase();
}

function eventSequence(component: IcalComponent): number {
  const value = component.getFirstPropertyValue("sequence");
  const sequence = Number(value);
  return Number.isFinite(sequence) ? sequence : 0;
}

function chooseNewer(left: IcalComponent | null, right: IcalComponent): IcalComponent {
  if (!left) {
    return right;
  }
  return eventSequence(right) >= eventSequence(left) ? right : left;
}

function recurrenceComponentKey(component: IcalComponent): string {
  const property = component.getFirstProperty("recurrence-id");
  if (!property) {
    return "";
  }
  const value = property.getFirstValue();
  if (!(value instanceof ICAL.Time)) {
    return property.toString();
  }
  return `${value.toString()}@${propertyTimeZone(component, "recurrence-id") || "floating"}`;
}

function groupComponents(components: IcalComponent[]): EventGroup[] {
  const groups = new Map<string, EventGroup>();

  components.forEach((component, sourceIndex) => {
    const uid = stringProperty(component, "uid").trim();
    const key = uid || `__ical_event_${sourceIndex}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        uid,
        master: null,
        exceptions: [],
        sourceIndex
      };
      groups.set(key, group);
    }

    if (component.hasProperty("recurrence-id")) {
      group.exceptions.push(component);
    } else {
      group.master = chooseNewer(group.master, component);
    }
  });

  for (const group of groups.values()) {
    const deduplicated = new Map<string, IcalComponent>();
    group.exceptions.forEach((component, index) => {
      const recurrenceKey = recurrenceComponentKey(component) || `__exception_${index}`;
      deduplicated.set(recurrenceKey, chooseNewer(deduplicated.get(recurrenceKey) || null, component));
    });
    group.exceptions = [...deduplicated.values()];
  }

  return [...groups.values()];
}

function occurrenceIdentity(time: IcalTime, propertyTzid?: string): string {
  const kind = time.isDate ? "D" : "T";
  const clock = time.isDate
    ? dateKey(time)
    : `${dateKey(time)}T${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(
        2,
        "0"
      )}:${String(time.second).padStart(2, "0")}`;
  return `${kind}:${clock}@${propertyTzid || timeZoneFromTime(time) || "floating"}`;
}

function canonicalEventId(group: EventGroup, recurrenceId: IcalTime, recurring: boolean): string {
  const base = group.uid || group.key;
  return recurring ? `${base}#${occurrenceIdentity(recurrenceId)}` : base;
}

function normalizedOccurrence(
  group: EventGroup,
  master: IcalEvent | null,
  details: IcalOccurrenceDetails,
  outputTimeZone: string,
  rangeStart: number,
  rangeEndExclusive: number
): NormalizedOccurrence | null {
  if (eventStatus(details.item) === "CANCELLED" || !details.startDate || !details.endDate) {
    return null;
  }

  const item = details.item;
  const component = item.component;
  const startTzid =
    propertyTimeZone(component, "dtstart") || timeZoneFromTime(details.startDate);
  const endTzid =
    propertyTimeZone(component, "dtend") || timeZoneFromTime(details.endDate) || startTzid;
  const startEpoch = timeToEpoch(details.startDate, startTzid, outputTimeZone);
  const endEpoch = timeToEpoch(details.endDate, endTzid, outputTimeZone);
  const effectiveEnd = Math.max(endEpoch, startEpoch + 1);

  if (startEpoch >= rangeEndExclusive || effectiveEnd <= rangeStart) {
    return null;
  }

  const recurring = Boolean(master?.isRecurring() || item.isRecurrenceException());
  const location = String(item.location || "");
  const event: CalendarEvent = {
    id: canonicalEventId(group, details.recurrenceId, recurring),
    title: String(item.summary || ""),
    start: calendarDateValue(details.startDate, startEpoch, outputTimeZone),
    end: calendarDateValue(details.endDate, endEpoch, outputTimeZone)
  };
  if (stringProperty(component, "transp").toUpperCase() === "TRANSPARENT") event.busy = false;
  if (/\[todo\]/i.test(stringProperty(component, "description"))) event.kind = "task";
  // Preserve only icon metadata; descriptions are not rendered or sent in full.
  const iconTokens = stringProperty(component, "description").match(/\[icon:[^\]\n]+\]/gi);
  if (iconTokens) event.description = iconTokens.join(" ");
  const color = stringProperty(component, "color") || (group.master ? stringProperty(group.master, "color") : "");
  if (color) event.color = color;
  if (location) {
    event.location = location;
  }

  return { event, startTime: startEpoch };
}

function exceptionAsOccurrence(exception: IcalComponent): IcalOccurrenceDetails | null {
  if (eventStatus(exception) === "CANCELLED" || !exception.hasProperty("dtstart")) {
    return null;
  }
  const item = new ICAL.Event(exception);
  const recurrenceId = item.recurrenceId || item.startDate;
  if (!item.startDate || !item.endDate || !recurrenceId) {
    return null;
  }
  return {
    recurrenceId,
    item,
    startDate: item.startDate,
    endDate: item.endDate
  };
}

function cancellationKey(
  recurrenceId: IcalTime,
  propertyTzid: string | undefined,
  outputTimeZone: string
): string {
  return recurrenceId.isDate
    ? `D:${dateKey(recurrenceId)}`
    : `T:${timeToEpoch(recurrenceId, propertyTzid, outputTimeZone)}`;
}

function cancelledRecurrenceKeys(
  exceptions: IcalComponent[],
  outputTimeZone: string
): Set<string> {
  const keys = new Set<string>();
  for (const component of exceptions) {
    if (eventStatus(component) !== "CANCELLED") {
      continue;
    }
    const value = component.getFirstProperty("recurrence-id")?.getFirstValue();
    if (value instanceof ICAL.Time) {
      keys.add(
        cancellationKey(
          value,
          propertyTimeZone(component, "recurrence-id"),
          outputTimeZone
        )
      );
    }
  }
  return keys;
}

function rangeExceptionExpansionEnd(
  exceptions: IcalComponent[],
  rangeEndExclusive: number,
  outputTimeZone: string
): number {
  let expansionEnd = rangeEndExclusive;

  for (const component of exceptions) {
    const recurrenceProperty = component.getFirstProperty("recurrence-id");
    const range = recurrenceProperty?.getParameter("range");
    if (
      String(Array.isArray(range) ? range[0] : range || "").toUpperCase() !==
        ICAL.Event.THISANDFUTURE ||
      eventStatus(component) === "CANCELLED" ||
      !component.hasProperty("dtstart")
    ) {
      continue;
    }

    const exception = new ICAL.Event(component);
    const recurrenceId = exception.recurrenceId;
    const actualStart = exception.startDate;
    if (!recurrenceId || !actualStart) {
      continue;
    }
    const originalEpoch = timeToEpoch(
      recurrenceId,
      propertyTimeZone(component, "recurrence-id"),
      outputTimeZone
    );
    const actualEpoch = timeToEpoch(
      actualStart,
      propertyTimeZone(component, "dtstart"),
      outputTimeZone
    );
    const shift = actualEpoch - originalEpoch;
    if (shift < 0 && actualEpoch < rangeEndExclusive) {
      expansionEnd = Math.max(expansionEnd, rangeEndExclusive - shift);
    }
  }

  return expansionEnd;
}

function registerCalendarTimezones(calendar: IcalComponent): RegisteredTimezone[] {
  const registrations: RegisteredTimezone[] = [];
  try {
    for (const component of calendar.getAllSubcomponents("vtimezone")) {
      const tzid = stringProperty(component, "tzid").trim();
      if (!tzid) {
        continue;
      }
      const previous = ICAL.TimezoneService.has(tzid)
        ? ICAL.TimezoneService.get(tzid)
        : undefined;
      ICAL.TimezoneService.register(component);
      registrations.push({ tzid, previous });
    }
    return registrations;
  } catch (error) {
    restoreCalendarTimezones(registrations);
    throw new ICalendarParseError("Could not register an iCalendar timezone", error);
  }
}

function restoreCalendarTimezones(registrations: RegisteredTimezone[]): void {
  for (const registration of [...registrations].reverse()) {
    if (registration.previous) {
      ICAL.TimezoneService.register(registration.previous, registration.tzid);
    } else {
      ICAL.TimezoneService.remove(registration.tzid);
    }
  }
}

function parseCalendarComponent(source: string): IcalComponent {
  if (typeof source !== "string" || !source.trim()) {
    throw new ICalendarParseError("iCalendar source must be a non-empty string");
  }
  try {
    const component = new ICAL.Component(ICAL.parse(source));
    if (component.name !== "vcalendar") {
      throw new Error(`Expected VCALENDAR, received ${component.name.toUpperCase()}`);
    }
    return component;
  } catch (error) {
    if (error instanceof ICalendarParseError) {
      throw error;
    }
    throw new ICalendarParseError("Could not parse iCalendar data", error);
  }
}

/**
 * Parse and expand an RFC 5545 calendar into the presentation layer's canonical event model.
 *
 * Returned events overlap the half-open `[rangeStart, rangeEndExclusive)` range. Recurrence
 * expansion is deliberately bounded; exceeding a limit throws instead of silently truncating.
 */
export function parseICalendar(
  source: string,
  options: ParseICalendarOptions
): CalendarEvent[] {
  const outputTimeZone = assertTimeZone(options.timeZone);
  const maxEvents = asPositiveLimit(
    options.maxEvents,
    DEFAULT_ICAL_EVENT_LIMIT,
    HARD_ICAL_EVENT_LIMIT,
    "maxEvents"
  );
  const maxOccurrences = asPositiveLimit(
    options.maxOccurrences,
    DEFAULT_ICAL_OCCURRENCE_LIMIT,
    HARD_ICAL_OCCURRENCE_LIMIT,
    "maxOccurrences"
  );
  const rangeStart = rangeValueToEpoch(options.rangeStart, outputTimeZone, "rangeStart");
  const rangeEndExclusive = rangeValueToEpoch(
    options.rangeEndExclusive,
    outputTimeZone,
    "rangeEndExclusive"
  );
  if (rangeEndExclusive <= rangeStart) {
    throw new RangeError("rangeEndExclusive must be later than rangeStart");
  }

  const calendar = parseCalendarComponent(source);
  const calendarColor = stringProperty(calendar, "color") || stringProperty(calendar, "x-apple-calendar-color");
  const registrations = registerCalendarTimezones(calendar);
  try {
    const components = calendar.getAllSubcomponents("vevent");
    if (components.length > maxEvents) {
      throw new ICalendarLimitError("ICAL_EVENT_LIMIT", maxEvents);
    }

    const groups = groupComponents(components);
    const results = new Map<string, NormalizedOccurrence>();
    let occurrenceCount = 0;
    const countOccurrence = (): void => {
      occurrenceCount += 1;
      if (occurrenceCount > maxOccurrences) {
        throw new ICalendarLimitError("ICAL_OCCURRENCE_LIMIT", maxOccurrences);
      }
    };

    for (const group of groups) {
      if (!group.master) {
        for (const exception of group.exceptions) {
          const details = exceptionAsOccurrence(exception);
          if (!details) {
            continue;
          }
          countOccurrence();
          const normalized = normalizedOccurrence(
            group,
            null,
            details,
            outputTimeZone,
            rangeStart,
            rangeEndExclusive
          );
          if (normalized) {
            results.set(String(normalized.event.id), normalized);
          }
        }
        continue;
      }

      if (eventStatus(group.master) === "CANCELLED" || !group.master.hasProperty("dtstart")) {
        continue;
      }

      const activeExceptions = group.exceptions.filter(
        (exception) => eventStatus(exception) !== "CANCELLED"
      );
      const cancellationKeys = cancelledRecurrenceKeys(group.exceptions, outputTimeZone);
      const master = new ICAL.Event(group.master, {
        strictExceptions: true,
        exceptions: activeExceptions
      });
      const seenExceptions = new Set<IcalComponent>();
      const seenRecurrenceIds = new Set<string>();
      const iterator = master.iterator();
      const masterStartTzid = propertyTimeZone(group.master, "dtstart");
      const expansionEnd = rangeExceptionExpansionEnd(
        activeExceptions,
        rangeEndExclusive,
        outputTimeZone
      );

      let recurrenceId: IcalTime | null;
      while ((recurrenceId = iterator.next())) {
        const recurrenceKey = occurrenceIdentity(recurrenceId, masterStartTzid);
        if (seenRecurrenceIds.has(recurrenceKey)) {
          continue;
        }
        seenRecurrenceIds.add(recurrenceKey);

        const originalEpoch = timeToEpoch(recurrenceId, masterStartTzid, outputTimeZone);
        if (originalEpoch >= expansionEnd) {
          break;
        }
        countOccurrence();

        if (
          cancellationKeys.has(
            cancellationKey(recurrenceId, masterStartTzid, outputTimeZone)
          )
        ) {
          continue;
        }

        const details = master.getOccurrenceDetails(recurrenceId);
        if (details.item !== master) {
          seenExceptions.add(details.item.component);
        }
        const normalized = normalizedOccurrence(
          group,
          master,
          details,
          outputTimeZone,
          rangeStart,
          rangeEndExclusive
        );
        if (normalized) {
          results.set(String(normalized.event.id), normalized);
        }
      }

      // A direct override may move an occurrence from beyond the iteration boundary into the
      // requested range. Process unseen overrides once so those events are not lost.
      for (const exception of group.exceptions) {
        if (seenExceptions.has(exception)) {
          continue;
        }
        const details = exceptionAsOccurrence(exception);
        if (!details) {
          continue;
        }
        countOccurrence();
        const normalized = normalizedOccurrence(
          group,
          master,
          details,
          outputTimeZone,
          rangeStart,
          rangeEndExclusive
        );
        if (normalized) {
          results.set(String(normalized.event.id), normalized);
        }
      }
    }

    return [...results.values()]
      .sort((left, right) => {
        const timeOrder = left.startTime - right.startTime;
        return timeOrder || String(left.event.id).localeCompare(String(right.event.id));
      })
      .map((item) => calendarColor ? { ...item.event, calendarColor } : item.event);
  } finally {
    restoreCalendarTimezones(registrations);
  }
}

/** Lower-camel alias for callers that prefer the feed-format spelling. */
export const parseIcalCalendar = parseICalendar;
