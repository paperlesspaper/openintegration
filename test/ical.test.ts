import { describe, expect, it } from "vitest";

import {
  ICalendarParseError,
  parseICalendar,
  parseIcalCalendar
} from "../src/ical";

function calendar(...components: string[]): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//paperlesspaper//iCalendar tests//EN",
    ...components,
    "END:VCALENDAR",
    ""
  ].join("\r\n");
}

function event(...lines: string[]): string {
  return ["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n");
}

describe("parseICalendar", () => {
  it("unfolds and unescapes text and preserves all-day duration semantics", () => {
    const source = calendar(
      event(
        "UID:all-day-1",
        "DTSTART;VALUE=DATE:20260722",
        "DURATION:P2D",
        "SUMMARY:Community\\, lunch with a",
        "  folded title\\nBring bread",
        "LOCATION:Hall\\; West"
      )
    );

    const events = parseICalendar(source, {
      rangeStart: "2026-07-23",
      rangeEndExclusive: "2026-07-24",
      timeZone: "Europe/Berlin"
    });

    expect(events).toEqual([
      {
        id: "all-day-1",
        title: "Community, lunch with a folded title\nBring bread",
        location: "Hall; West",
        start: { date: "2026-07-22" },
        end: { date: "2026-07-24" }
      }
    ]);
  });

  it("normalizes TZID and floating date-times without using the process timezone", () => {
    const source = calendar(
      event(
        "UID:berlin-dst",
        "DTSTART;TZID=Europe/Berlin:20260329T033000",
        "DURATION:PT1H",
        "SUMMARY:After the DST jump"
      ),
      event(
        "UID:floating",
        "DTSTART:20260329T090000",
        "DTEND:20260329T100000",
        "SUMMARY:Floating local time"
      )
    );

    const events = parseICalendar(source, {
      rangeStart: "2026-03-29",
      rangeEndExclusive: "2026-03-30",
      timeZone: "Europe/Berlin"
    });

    expect(events.map((item) => item.start)).toEqual([
      { dateTime: "2026-03-29T01:30:00.000Z", timeZone: "Europe/Berlin" },
      { dateTime: "2026-03-29T07:00:00.000Z", timeZone: "Europe/Berlin" }
    ]);
    expect(events.map((item) => item.end)).toEqual([
      { dateTime: "2026-03-29T02:30:00.000Z", timeZone: "Europe/Berlin" },
      { dateTime: "2026-03-29T08:00:00.000Z", timeZone: "Europe/Berlin" }
    ]);
  });

  it("uses a bundled VTIMEZONE definition for non-IANA timezone identifiers", () => {
    const source = calendar(
      [
        "BEGIN:VTIMEZONE",
        "TZID:Custom/Fixed-0230",
        "BEGIN:STANDARD",
        "DTSTART:19700101T000000",
        "TZOFFSETFROM:+0230",
        "TZOFFSETTO:+0230",
        "TZNAME:CUSTOM",
        "END:STANDARD",
        "END:VTIMEZONE"
      ].join("\r\n"),
      event(
        "UID:custom-zone",
        "DTSTART;TZID=Custom/Fixed-0230:20260722T090000",
        "DTEND;TZID=Custom/Fixed-0230:20260722T100000",
        "SUMMARY:Custom timezone"
      )
    );

    const events = parseICalendar(source, {
      rangeStart: "2026-07-22",
      rangeEndExclusive: "2026-07-23",
      timeZone: "UTC"
    });

    expect(events[0]?.start.dateTime).toBe("2026-07-22T06:30:00.000Z");
    expect(events[0]?.end?.dateTime).toBe("2026-07-22T07:30:00.000Z");
  });

  it("combines RRULE and RDATE occurrences and applies EXDATE", () => {
    const source = calendar(
      event(
        "UID:recurring-1",
        "DTSTART:20260720T080000Z",
        "DURATION:PT1H",
        "RRULE:FREQ=DAILY;COUNT=5",
        "RDATE:20260726T080000Z",
        "EXDATE:20260722T080000Z",
        "SUMMARY:Morning prayer"
      )
    );

    const events = parseICalendar(source, {
      rangeStart: "2026-07-21",
      rangeEndExclusive: "2026-07-27",
      timeZone: "UTC"
    });

    expect(events.map((item) => item.start.dateTime)).toEqual([
      "2026-07-21T08:00:00.000Z",
      "2026-07-23T08:00:00.000Z",
      "2026-07-24T08:00:00.000Z",
      "2026-07-26T08:00:00.000Z"
    ]);
  });

  it("applies moved overrides, suppresses cancellations, and finds an override moved into range", () => {
    const source = calendar(
      event(
        "UID:series-1",
        "DTSTART:20260720T080000Z",
        "DURATION:PT1H",
        "RRULE:FREQ=DAILY;COUNT=5",
        "SUMMARY:Regular service",
        "LOCATION:Main church"
      ),
      event(
        "UID:series-1",
        "RECURRENCE-ID:20260721T080000Z",
        "DTSTART:20260721T120000Z",
        "DTEND:20260721T133000Z",
        "SUMMARY:Rescheduled service",
        "LOCATION:Parish hall"
      ),
      event(
        "UID:series-1",
        "RECURRENCE-ID:20260722T080000Z",
        "STATUS:CANCELLED",
        "SEQUENCE:2"
      ),
      event(
        "UID:series-1",
        "RECURRENCE-ID:20260724T080000Z",
        "DTSTART:20260722T180000Z",
        "DTEND:20260722T190000Z",
        "SUMMARY:Future occurrence moved earlier"
      )
    );

    const events = parseICalendar(source, {
      rangeStart: "2026-07-20",
      rangeEndExclusive: "2026-07-24",
      timeZone: "UTC"
    });

    expect(events.map((item) => [item.title, item.start.dateTime])).toEqual([
      ["Regular service", "2026-07-20T08:00:00.000Z"],
      ["Rescheduled service", "2026-07-21T12:00:00.000Z"],
      ["Future occurrence moved earlier", "2026-07-22T18:00:00.000Z"],
      ["Regular service", "2026-07-23T08:00:00.000Z"]
    ]);
    expect(events[1]?.location).toBe("Parish hall");
    expect(events.some((item) => item.start.dateTime === "2026-07-22T08:00:00.000Z")).toBe(
      false
    );
  });

  it("supports RECURRENCE-ID RANGE=THISANDFUTURE shifts", () => {
    const source = calendar(
      event(
        "UID:ranged-series",
        "DTSTART:20260720T090000Z",
        "DURATION:PT1H",
        "RRULE:FREQ=DAILY;COUNT=5",
        "SUMMARY:Original time"
      ),
      event(
        "UID:ranged-series",
        "RECURRENCE-ID;RANGE=THISANDFUTURE:20260722T090000Z",
        "DTSTART:20260722T070000Z",
        "DURATION:PT1H",
        "SUMMARY:Earlier from now on"
      )
    );

    const events = parseIcalCalendar(source, {
      rangeStart: "2026-07-22",
      rangeEndExclusive: "2026-07-25",
      timeZone: "UTC"
    });

    expect(events.map((item) => item.start.dateTime)).toEqual([
      "2026-07-22T07:00:00.000Z",
      "2026-07-23T07:00:00.000Z",
      "2026-07-24T07:00:00.000Z"
    ]);
    expect(events.every((item) => item.title === "Earlier from now on")).toBe(true);
  });

  it("enforces source event and expanded occurrence limits", () => {
    const twoEvents = calendar(
      event("UID:first", "DTSTART;VALUE=DATE:20260722", "SUMMARY:First"),
      event("UID:second", "DTSTART;VALUE=DATE:20260723", "SUMMARY:Second")
    );

    expect(() =>
      parseICalendar(twoEvents, {
        rangeStart: "2026-07-22",
        rangeEndExclusive: "2026-07-24",
        timeZone: "UTC",
        maxEvents: 1
      })
    ).toThrowError(expect.objectContaining({ code: "ICAL_EVENT_LIMIT", limit: 1 }));

    const recurring = calendar(
      event(
        "UID:limited-series",
        "DTSTART:20260720T080000Z",
        "RRULE:FREQ=DAILY;COUNT=10",
        "SUMMARY:Repeated"
      )
    );
    expect(() =>
      parseICalendar(recurring, {
        rangeStart: "2026-07-20",
        rangeEndExclusive: "2026-07-30",
        timeZone: "UTC",
        maxOccurrences: 2
      })
    ).toThrowError(
      expect.objectContaining({ code: "ICAL_OCCURRENCE_LIMIT", limit: 2 })
    );
  });

  it("rejects malformed calendars and invalid civil ranges", () => {
    expect(() =>
      parseICalendar("not a calendar", {
        rangeStart: "2026-07-22",
        rangeEndExclusive: "2026-07-23",
        timeZone: "UTC"
      })
    ).toThrowError(ICalendarParseError);

    expect(() =>
      parseICalendar(calendar(), {
        rangeStart: "2026-02-30",
        rangeEndExclusive: "2026-03-01",
        timeZone: "UTC"
      })
    ).toThrowError(RangeError);
  });
});

describe("iCalendar colors", () => {
  it("preserves calendar colors, event overrides and inheritance by recurrence exceptions", () => {
    const result = parseICalendar(calendar(
      "X-APPLE-CALENDAR-COLOR:#0000ffff",
      event("UID:color", "DTSTART:20260722T100000Z", "DTEND:20260722T110000Z", "RRULE:FREQ=DAILY;COUNT=3", "COLOR:red", "SUMMARY:Colored event"),
      event("UID:color", "RECURRENCE-ID:20260723T100000Z", "DTSTART:20260723T120000Z", "DTEND:20260723T130000Z", "SUMMARY:Moved event"),
      event("UID:color", "RECURRENCE-ID:20260724T100000Z", "DTSTART:20260724T100000Z", "DTEND:20260724T110000Z", "COLOR:yellow", "SUMMARY:Override")
    ), {rangeStart:"2026-07-20",rangeEndExclusive:"2026-07-27",timeZone:"UTC"});
    expect(result.map(e=>[e.color,e.calendarColor])).toEqual([["red","#0000ffff"],["red","#0000ffff"],["yellow","#0000ffff"]]);
  });
  it("prefers standard VCALENDAR COLOR to the Apple extension", () => {
    const result = parseICalendar(calendar("COLOR:green","X-APPLE-CALENDAR-COLOR:#0000ffff",event("UID:one","DTSTART:20260722T100000Z","DTEND:20260722T110000Z")),{rangeStart:"2026-07-20",rangeEndExclusive:"2026-07-27",timeZone:"UTC"});
    expect(result[0].calendarColor).toBe("green");
    expect(result[0].color).toBeUndefined();
  });
});

it("preserves only description icon tokens for calendar presentation", () => {
  const events = parseICalendar(calendar(event(
    "UID:icon-metadata",
    "DTSTART;VALUE=DATE:20260722",
    "DTEND;VALUE=DATE:20260723",
    "SUMMARY:Appointment",
    "DESCRIPTION:[todo] Private notes [icon:medical] and [icon:star]",
    "TRANSP:TRANSPARENT"
  )), {rangeStart:"2026-07-22",rangeEndExclusive:"2026-07-23",timeZone:"Europe/Berlin"});
  expect(events[0].description).toBe("[icon:medical] [icon:star]");
  expect(events[0].kind).toBe("task");
  expect(events[0].busy).toBe(false);
  expect(JSON.stringify(events)).not.toContain("Private notes");
});
