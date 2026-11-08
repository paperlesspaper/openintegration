import { describe, expect, it, vi } from "vitest";
import {
  bootCalendarApiIntegration,
  buildCalendarRange,
  fitCalendarLayout,
  normalizeCalendarSettings,
  prepareCalendarEvents,
  renderCalendarLayout
} from "../src";

function resetDom(): HTMLElement {
  document.body.innerHTML = '<main id="app"></main>';
  return document.querySelector<HTMLElement>("#app")!;
}

describe("shared calendar settings", () => {
  it("normalizes aliases and clamps display limits", () => {
    expect(
      normalizeCalendarSettings({
        view: "3-days",
        language: "de-DE",
        daysAhead: 900,
        maxEvents: 0,
        highlightToday: "yes",
        highlightScale: 8,
        fontSize: 200,
        noPadding: "yes",
        fullWeekdayNames: "true",
        showLocation: "off"
      })
    ).toMatchObject({
      view: "three-days",
      locale: "de-DE",
      dayRange: 366,
      maxEvents: 1,
      highlightToday: true,
      highlightScale: 3,
      fontSize: 150,
      noPadding: true,
      fullWeekdayNames: true,
      showLocation: false
    });
  });

  it("bounds font size and restores its default on updates", () => {
    expect(normalizeCalendarSettings({ fontSize: 20 }).fontSize).toBe(75);
    expect(normalizeCalendarSettings({ fontSize: "125" }).fontSize).toBe(125);
    expect(normalizeCalendarSettings({ fontSize: "invalid" }).fontSize).toBe(100);
    const target = resetDom();
    renderCalendarLayout({ target, settings: { fontSize: 125 } });
    expect(target.style.getPropertyValue("--pp-cal-font-scale")).toBe("1.25");
    renderCalendarLayout({ target });
    expect(target.style.getPropertyValue("--pp-cal-font-scale")).toBe("1");
  });

  it("builds a Monday-first week in the configured timezone", () => {
    const range = buildCalendarRange(
      { view: "week", timeZone: "Europe/Berlin" },
      "2026-07-22T10:00:00Z"
    );

    expect(range.dateKeys).toHaveLength(7);
    expect(range.dateKeys[0]).toBe("2026-07-20");
    expect(range.dateKeys.at(-1)).toBe("2026-07-26");
  });
});

describe("shared calendar events", () => {
  it("keeps date-only values stable and groups timed values by the configured timezone", () => {
    const settings = normalizeCalendarSettings({
      view: "day",
      timeZone: "Europe/Berlin"
    });
    const events = prepareCalendarEvents(
      [
        {
          title: "Late call",
          start: { dateTime: "2026-07-21T23:30:00Z", timeZone: "America/New_York" }
        },
        { title: "Holiday", start: { date: "2026-07-22" } },
        { title: "Tomorrow", start: { date: "2026-07-23" } }
      ],
      settings,
      "2026-07-22T08:00:00Z"
    );

    expect(events.map((item) => item.dateKey)).toEqual(["2026-07-22", "2026-07-22"]);
    expect(events.map((item) => item.event.title)).toEqual(["Holiday", "Late call"]);
  });

  it("keeps overlapping and multi-day events on every visible civil day", () => {
    const settings = normalizeCalendarSettings({
      view: "three-days",
      timeZone: "UTC"
    });
    const events = prepareCalendarEvents(
      [
        {
          title: "Retreat",
          start: { date: "2026-07-20" },
          end: { date: "2026-07-24" }
        },
        {
          title: "Overnight support",
          start: { dateTime: "2026-07-21T23:00:00Z" },
          end: { dateTime: "2026-07-22T02:00:00Z" }
        }
      ],
      settings,
      "2026-07-22T08:00:00Z"
    );

    expect(events.map((item) => [item.event.title, item.dateKey])).toEqual([
      ["Retreat", "2026-07-22"],
      ["Overnight support", "2026-07-22"],
      ["Retreat", "2026-07-23"]
    ]);
  });
});

describe("shared calendar rendering", () => {
  it("renders provider headers and safely escapes common event fields", () => {
    const target = resetDom();
    const layout = renderCalendarLayout({
      target,
      now: "2026-07-22T08:00:00Z",
      settings: { view: "agenda", locale: "en", timeZone: "UTC" },
      header: { kicker: "Parish", title: "Rota", source: "Sample data" },
      events: [
        {
          title: "<script>unsafe()</script>",
          start: { dateTime: "2026-07-22T10:00:00Z", timeZone: "UTC" },
          end: { dateTime: "2026-07-22T11:00:00Z", timeZone: "UTC" },
          location: '<img src=x onerror="unsafe()">',
          details: [{ label: "Role", value: "Reader <Admin>" }]
        }
      ]
    });

    expect(layout.events).toHaveLength(1);
    expect(target.querySelector(".pp-cal-title")?.textContent).toBe("Rota");
    expect(target.querySelector(".pp-cal-event-title")?.textContent).toBe(
      "<script>unsafe()</script>"
    );
    expect(target.querySelector(".pp-cal-event-location")?.textContent).toContain("onerror");
    expect(target.querySelector("script")).toBeNull();
    expect(target.querySelector(".pp-cal-event-detail-value")?.textContent).toBe(
      "Reader <Admin>"
    );
  });

  it("renders the common week and year view structures", () => {
    const target = resetDom();
    renderCalendarLayout({
      target,
      now: "2026-07-22T08:00:00Z",
      settings: { view: "week", timeZone: "UTC" }
    });
    expect(target.querySelectorAll(".pp-cal-week-cell")).toHaveLength(7);

    renderCalendarLayout({
      target,
      now: "2026-07-22T08:00:00Z",
      settings: { view: "year", timeZone: "UTC" }
    });
    expect(target.querySelectorAll(".pp-cal-month")).toHaveLength(12);
    expect(target.querySelectorAll(".pp-cal-month-day")).toHaveLength(504);
  });

  it("shows how many agenda events are hidden by the display limit", () => {
    const target = resetDom();
    renderCalendarLayout({
      target,
      now: "2026-07-22T08:00:00Z",
      settings: { view: "agenda", maxEvents: 1, timeZone: "UTC" },
      events: [
        { title: "First", start: { dateTime: "2026-07-22T09:00:00Z" } },
        { title: "Second", start: { dateTime: "2026-07-22T10:00:00Z" } }
      ]
    });

    expect(target.querySelectorAll(".pp-cal-event")).toHaveLength(1);
    expect(target.querySelector(".pp-cal-more")?.textContent).toBe("+1 more");
  });

  it("applies today highlighting only when enabled and reports hidden day events", () => {
    const target = resetDom();
    const events = [
      { title: "First", start: { dateTime: "2026-07-22T09:00:00Z" } },
      {
        title: "Second",
        start: { dateTime: "2026-07-22T10:00:00Z" },
        details: [{ label: "Owner", value: "Sam" }]
      }
    ];
    renderCalendarLayout({
      target,
      now: "2026-07-22T08:00:00Z",
      settings: { view: "day", maxEvents: 1, timeZone: "UTC", highlightToday: false },
      events
    });
    expect(target.querySelector(".is-today")).toBeNull();
    expect(target.querySelector(".pp-cal-more")?.textContent).toBe("+1 more");

    renderCalendarLayout({
      target,
      now: "2026-07-22T08:00:00Z",
      settings: { view: "day", maxEvents: 2, timeZone: "UTC", highlightToday: true },
      events
    });
    expect(target.querySelector(".pp-cal-column.is-today")).not.toBeNull();
    expect(target.querySelector(".pp-cal-event-details")?.textContent).toContain("Sam");
  });

  it("boots canonical API calendars with settings in a JSON POST body", async () => {
    const target = resetDom();
    window.history.replaceState({}, "", "/");
    window.history.replaceState({}, "", "/?language=de-DE&daysAhead=3");
    const requests: Array<{ body: string; method: string; url: string }> = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/languages/")) {
        return new Response(
          JSON.stringify({
            allDay: "All day",
            empty: "No events",
            moreEvents: "+{count} more",
            sampleSource: "Sample data",
            today: "Today",
            untitled: "Untitled"
          }),
          { status: 200 }
        );
      }
      requests.push({
        body: String(init?.body || ""),
        method: String(init?.method || "GET"),
        url
      });
      return new Response(
        JSON.stringify({
          sample: true,
          calendarName: "Private feed",
          calendarColor: "#00ff00",
          events: [{ calendarColor: "#ff0000", title: "Appointment", start: { date: "2026-07-22" } }]
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await bootCalendarApiIntegration({
      target,
      timeoutMs: 0,
      fetch: fetchMock as typeof fetch,
      defaults: {
        feedUrl: "https://calendar.example.test/private-token",
        appPassword: "secret",
        dayRange: 14,
        locale: "en-US",
        now: "2026-07-22T08:00:00Z",
        timeZone: "UTC",
        view: "agenda"
      }
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ method: "POST" });
    expect(requests[0]?.url).not.toContain("private-token");
    expect(JSON.parse(requests[0]?.body || "{}")).toMatchObject({
      appPassword: "secret",
      dayRange: 3,
      feedUrl: "https://calendar.example.test/private-token",
      locale: "de-DE",
      rangeEndExclusive: "2026-07-25",
      rangeStart: "2026-07-22",
      view: "agenda"
    });
    expect(target.querySelector(".pp-cal-event-title")?.textContent).toBe("Appointment");
    expect(target.querySelector<HTMLElement>(".pp-cal-event")?.style.getPropertyValue("--pp-cal-event-bg")).toBe("var(--pp-green)");
    window.history.replaceState({}, "", "/");
    vi.unstubAllGlobals();
  });
});

describe("weekly time grid", () => {
  function render(events: Parameters<typeof renderCalendarLayout>[0]["events"], settings = {}) {
    const target = resetDom();
    renderCalendarLayout({ target, events, now: "2026-07-22T10:00:00Z", settings: {
      view: "week", locale: "de-DE", timeZone: "Europe/Berlin", highlightToday: true, ...settings
    } });
    return target;
  }

  it("uses the day header for today and removes redundant weekly banners", () => {
    const target = render([]);
    expect(target.querySelector(".pp-cal-today")).toBeNull();
    expect(target.querySelector(".pp-cal-range-title")).toBeNull();
    expect(target.querySelectorAll(".pp-cal-week-heading")).toHaveLength(7);
    expect(target.querySelector(".pp-cal-week-heading.is-today")?.textContent).toContain("22.");
    expect(render([], { highlightToday: false }).querySelector(".is-today")).toBeNull();
  });

  it("localizes full weekdays and resets display options on subsequent renders", () => {
    const target = render([], { noPadding: true, fullWeekdayNames: true });
    expect(target.classList.contains("pp-cal--no-padding")).toBe(true);
    expect(Array.from(target.querySelectorAll(".pp-cal-column-weekday"), day => day.textContent))
      .toEqual(["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"]);
    renderCalendarLayout({ target, now: "2026-07-22T10:00:00Z", settings: {
      view: "week", locale: "en-GB", fullWeekdayNames: true
    } });
    expect(target.querySelector(".pp-cal-column-weekday")?.textContent).toBe("Monday");
    expect(target.classList.contains("pp-cal--no-padding")).toBe(false);
    renderCalendarLayout({ target, now: "2026-07-22T10:00:00Z", settings: { view: "week", locale: "de-DE" } });
    expect(target.classList.contains("pp-cal--full-weekdays")).toBe(false);
    expect(target.querySelector(".pp-cal-column-weekday")?.textContent).toBe("Mo");
  });

  it("positions events in the display timezone and separates all-day entries", () => {
    const target = render([
      { title: "Meeting", start: { dateTime: "2026-07-22T08:00:00Z" }, end: { dateTime: "2026-07-22T09:30:00Z" } },
      { title: "Holiday", start: { date: "2026-07-22" }, end: { date: "2026-07-23" } }
    ]);
    const slot = target.querySelector<HTMLElement>(".pp-cal-week-slot")!;
    expect(slot.dataset.start).toBe("600");
    expect(slot.dataset.end).toBe("690");
    expect(slot.style.top).toBe("20%");
    expect(slot.style.height).toBe("15%");
    expect(target.querySelector(".pp-cal-week-all-day")?.textContent).toContain("Holiday");
    expect(target.querySelectorAll(".pp-cal-week-slot")).toHaveLength(1);
  });

  it("lays out chained overlaps in separate lanes and reuses space after a cluster", () => {
    const event = (title: string, start: string, end: string) => ({ title,
      start: { dateTime: `2026-07-22T${start}:00+02:00` },
      end: { dateTime: `2026-07-22T${end}:00+02:00` }
    });
    const target = render([event("A", "09:00", "10:00"), event("B", "09:30", "10:30"),
      event("C", "10:00", "11:00"), event("D", "11:00", "12:00")]);
    const slots = Array.from(target.querySelectorAll<HTMLElement>(".pp-cal-week-slot"));
    expect(slots.map((slot) => [slot.dataset.lane, slot.dataset.lanes])).toEqual([
      ["0", "2"], ["1", "2"], ["0", "2"], ["0", "1"]
    ]);
  });

  it("splits overnight events at local midnight without adding a day at an exclusive end", () => {
    const target = render([
      { title: "Night shift", start: { dateTime: "2026-07-22T23:00:00+02:00" }, end: { dateTime: "2026-07-23T02:00:00+02:00" } },
      { title: "Ends at midnight", start: { dateTime: "2026-07-24T23:00:00+02:00" }, end: { dateTime: "2026-07-25T00:00:00+02:00" } }
    ]);
    const slots = Array.from(target.querySelectorAll<HTMLElement>(".pp-cal-week-slot"));
    expect(slots.map((slot) => [slot.dataset.start, slot.dataset.end])).toEqual([
      ["1380", "1440"], ["0", "120"], ["1380", "1440"]
    ]);
  });

  it("keeps short appointments readable without visual collisions and refits idempotently", () => {
    const target = render([
      { title: "Short A", start: { dateTime: "2026-07-22T10:00:00+02:00" }, end: { dateTime: "2026-07-22T10:05:00+02:00" } },
      { title: "Short B", start: { dateTime: "2026-07-22T10:05:00+02:00" }, end: { dateTime: "2026-07-22T10:10:00+02:00" } }
    ]);
    const grid = target.querySelector<HTMLElement>(".pp-cal-week-grid")!;
    Object.defineProperty(grid, "clientHeight", { value: 300, configurable: true });
    fitCalendarLayout(target);
    const slots = Array.from(target.querySelectorAll<HTMLElement>(".pp-cal-week-slot"));
    expect(slots.map((slot) => slot.style.width)).toEqual(["50%", "50%"]);
    expect(slots.every((slot) => slot.classList.contains("is-compact"))).toBe(true);
    const geometry = slots.map((slot) => slot.getAttribute("style"));
    fitCalendarLayout(target);
    expect(slots.map((slot) => slot.getAttribute("style"))).toEqual(geometry);
    Object.defineProperty(grid, "clientHeight", { value: 4000 });
    fitCalendarLayout(target);
    expect(slots.map((slot) => slot.style.width)).toEqual(["100%", "100%"]);
  });

  it("honors the event limit instead of silently capping every day at four", () => {
    const events = Array.from({ length: 6 }, (_, i) => ({ title: `Event ${i}`,
      start: { dateTime: `2026-07-22T${String(8 + i).padStart(2, "0")}:00:00Z` }
    }));
    expect(render(events).querySelectorAll(".pp-cal-week-slot")).toHaveLength(6);
    const limited = render(events, { maxEvents: 5 });
    expect(limited.querySelectorAll(".pp-cal-week-slot")).toHaveLength(5);
    expect(limited.querySelector(".pp-cal-week-overflow")?.textContent).toContain("+1");
  });
});

describe("provider calendar colors", () => {
  const show = (color?: string, calendarColor?: string) => {
    const target = resetDom();
    renderCalendarLayout({ target, now: "2026-07-22T10:00:00Z", settings: {view:"week",timeZone:"UTC"},
      events: [{ title:"Color test", color, calendarColor, start:{dateTime:"2026-07-22T10:00:00Z"}, end:{dateTime:"2026-07-22T11:00:00Z"} }] });
    return target.querySelector<HTMLElement>(".pp-cal-event")!;
  };
  it("prefers event overrides, then calendar color, then theme", () => {
    expect(show("#f00", "#0000ff").style.getPropertyValue("--pp-cal-event-bg")).toBe("var(--pp-red)");
    expect(show(undefined,"#0000ffff").style.getPropertyValue("--pp-cal-event-bg")).toBe("var(--pp-blue)");
    expect(show().hasAttribute("style")).toBe(false);
  });
  it("maps source colors to native pigments and uses a contrasting text color", () => {
    for (const [input,bg,fg] of [["yellow","yellow","black"],["#16a34a","green","black"],["rebeccapurple","blue","white"],["#ffffff","white","black"],["#111111","black","white"]]) {
      const card=show(input);
      expect(card.style.getPropertyValue("--pp-cal-event-bg")).toBe(`var(--pp-${bg})`);
      expect(card.style.getPropertyValue("--pp-cal-event-fg")).toBe(`var(--pp-${fg})`);
    }
  });
  it("keeps native green during EPD processing and restores the original settings without source colors", () => {
    document.querySelector('meta[name="paperless:epd-optimize"]')?.remove();
    const meta = document.createElement("meta");
    meta.name = "paperless:epd-optimize";
    meta.content = '{"intent":"readable"}';
    document.head.append(meta);
    show("#00ff00");
    expect(JSON.parse(meta.content)).toMatchObject({palette:"spectra6OriginalPalette",canvasDitherOptions:{ditheringType:"errorDiffusion"}});
    show();
    expect(meta.content).toBe('{"intent":"readable"}');
    meta.content = '{"enabled":false}';
    show("red");
    expect(meta.content).toBe('{"enabled":false}');
    meta.remove();
  });
  it("rejects CSS injection, contextual values and transparent colors", () => {
    for(const value of ['red;position:fixed','url(https://example.com/x)','var(--pp-bg)','currentColor','transparent','#ff000000','</article><script>alert(1)</script>']) {
      expect(show(value).hasAttribute("style")).toBe(false);
      expect(show(value,"#00f").style.getPropertyValue("--pp-cal-event-bg")).toBe("var(--pp-blue)");
    }
  });
});

describe("optional editorial calendar views", () => {
  it.each(["agenda-modern", "today-next"])("uses the complete agenda range for %s", view => {
    const range = buildCalendarRange({ view, dayRange: 14, timeZone: "America/New_York" }, "2026-07-23T01:00:00Z");
    expect(range.startKey).toBe("2026-07-22");
    expect(range.endKey).toBe("2026-08-05");
  });

  it("features an ongoing event ahead of completed and all-day events without losing them", () => {
    const target = resetDom();
    const event = (title: string, start: string, end: string) => ({ title, start: { dateTime: start }, end: { dateTime: end } });
    renderCalendarLayout({ target, now: "2026-07-22T10:00:00Z", settings: { view: "today-next", timeZone: "Europe/Berlin", dayRange: 3 },
      messages: { ongoing: "Jetzt", later: "Danach" }, events: [
        { title: "Birthday", start: { date: "2026-07-22" } },
        event("Finished", "2026-07-22T07:00:00Z", "2026-07-22T08:00:00Z"),
        event("Ongoing", "2026-07-22T09:00:00Z", "2026-07-22T11:00:00Z"),
        event("Later", "2026-07-22T12:00:00Z", "2026-07-22T13:00:00Z"),
        { title: "Tomorrow", start: { date: "2026-07-23" } }
      ] });
    expect(target.querySelector(".pp-cal-featured")?.textContent).toContain("Jetzt");
    expect(target.querySelector(".pp-cal-featured .pp-cal-event-title")?.textContent).toBe("Ongoing");
    expect(target.querySelectorAll(".pp-cal-event")).toHaveLength(5);
    expect(target.querySelector(".pp-cal-focus-later")?.textContent).toContain("Tomorrow");
  });

  it("shows an empty today, escapes provider text and resets when returning to classic", () => {
    const target = resetDom();
    renderCalendarLayout({ target, now: "2026-07-22T10:00:00Z", settings: { view: "today-next", timeZone: "UTC" },
      events: [{ title: '<img src=x onerror=alert(1)>', start: { date: "2026-07-23" } }] });
    expect(target.querySelector(".pp-cal-focus-today .pp-cal-empty")).not.toBeNull();
    expect(target.querySelector("img")).toBeNull();
    expect(target.querySelector(".pp-cal-event-title")?.textContent).toBe('<img src=x onerror=alert(1)>');
    renderCalendarLayout({ target, settings: { view: "agenda" } });
    expect(target.classList.contains("pp-cal--modern")).toBe(false);
    expect(target.classList.contains("pp-cal--view-today-next")).toBe(false);
  });
});

describe("rolling seven-day calendar previews", () => {
  it.each(["rolling-week", "rolling-week-list"])("starts %s on the local current day and crosses DST/month boundaries", view => {
    const range = buildCalendarRange({ view, dayRange: 1, timeZone: "Europe/Berlin" }, "2026-10-23T22:30:00Z");
    expect(range.dateKeys).toEqual(["2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"]);
    expect(range.endKey).toBe("2026-10-31");
    expect(buildCalendarRange({view,timeZone:"Europe/Berlin"},"2026-12-29T10:00:00Z").dateKeys.at(-1)).toBe("2027-01-04");
  });
  it("keeps empty days, caps each list independently and includes the seventh day", () => {
    const target = resetDom();
    renderCalendarLayout({target,now:"2026-07-24T10:00:00Z",settings:{view:"rolling-week-list",timeZone:"UTC",maxEvents:1},events:[
      {title:"First",start:{date:"2026-07-24"}}, {title:"Second",start:{date:"2026-07-24"}},
      {title:"Last day",start:{date:"2026-07-30"}}, {title:"Outside",start:{date:"2026-07-31"}}
    ]});
    expect(target.querySelectorAll(".pp-cal-rolling-day")).toHaveLength(7);
    expect(target.querySelectorAll(".pp-cal-rolling-day .pp-cal-empty")).toHaveLength(5);
    expect(target.querySelector(".pp-cal-rolling-day .pp-cal-more")?.textContent).toBe("+1 more");
    expect(target.textContent).toContain("Last day");
    expect(target.textContent).not.toContain("Outside");
  });
  it("renders 7 landscape dates and 4+3 portrait dates with the same time scale", () => {
    const target = resetDom();
    renderCalendarLayout({target,now:"2026-07-24T10:00:00Z",settings:{view:"rolling-week",timeZone:"UTC"},events:[
      {title:"Early",start:{dateTime:"2026-07-24T06:00:00Z"},end:{dateTime:"2026-07-24T07:00:00Z"}},
      {title:"Late",start:{dateTime:"2026-07-30T20:00:00Z"},end:{dateTime:"2026-07-30T21:00:00Z"}}
    ]});
    expect(target.querySelectorAll(".pp-cal-rolling-grid-wide .pp-cal-week-heading")).toHaveLength(7);
    const panels=target.querySelectorAll(".pp-cal-rolling-grid-stacked .pp-cal-week");
    expect([...panels].map(panel=>panel.querySelectorAll(".pp-cal-week-heading").length)).toEqual([4,3]);
    expect([...panels].map(panel=>panel.querySelectorAll(".pp-cal-hour").length)).toEqual([16,16]);
    renderCalendarLayout({target,settings:{view:"week"}});
    expect(target.classList.contains("pp-cal--rolling")).toBe(false);
    expect(target.querySelectorAll(".pp-cal-week")).toHaveLength(1);
  });
});

describe("optional personal calendar features", () => {
  const now = "2026-07-22T10:00:00Z";
  const timed = (title: string, start: string, end?: string) => ({title, start: {dateTime: `2026-07-22T${start}:00Z`}, ...(end ? {end: {dateTime: `2026-07-22T${end}:00Z`}} : {})});
  const summary = (events: any[], settings = {}) => {
    const target = resetDom();
    renderCalendarLayout({target, events, now, settings: {showDaySummary:true, locale:"en-GB", timeZone:"Europe/Berlin", ...settings}});
    return target.querySelector(".pp-cal-day-summary")!.textContent!;
  };

  it("counts ongoing and upcoming appointments before display truncation, excluding ended events", () => {
    const text = summary([timed("Ended", "09:00", "10:00"), timed("Meeting", "09:45", "11:00"), timed("Dentist", "12:00", "13:00")], {maxEvents:1});
    expect(text).toContain("2 timed events remaining");
    expect(text).toContain("Now · 11:45 · Meeting");
    expect(text).toContain("No timed events after 15:00");
    expect(text).toContain("As of 12:00");
  });

  it("counts all-day events separately and avoids unsupported availability claims", () => {
    const text = summary([{title:"Holiday", start:{date:"2026-07-21"}, end:{date:"2026-07-23"}}, timed("Meeting", "12:00", "13:00")]);
    expect(text).toContain("1 timed event remaining · 1 all-day");
    expect(text).not.toContain("after");
    expect(summary([timed("No end", "12:00")])).not.toContain("after");
    expect(summary([{title:"Overnight", start:{dateTime:"2026-07-22T21:00:00Z"}, end:{dateTime:"2026-07-23T06:00:00Z"}}])).not.toContain("after");
  });

  it("uses the local day at midnight and through a DST change", () => {
    const target = resetDom();
    renderCalendarLayout({target, now:"2026-10-24T22:15:00Z", settings:{showDaySummary:true,timeZone:"Europe/Berlin",locale:"en-GB"}, events:[
      {title:"Overnight",start:{dateTime:"2026-10-24T21:00:00Z"},end:{dateTime:"2026-10-25T02:30:00Z"}},
      {title:"Yesterday",start:{date:"2026-10-24"},end:{date:"2026-10-25"}}
    ]});
    expect(target.querySelector(".pp-cal-day-summary")!.textContent).toContain("1 timed event remaining");
    expect(target.querySelector(".pp-cal-day-summary")!.textContent).toContain("after 03:30");
    expect(target.querySelector(".pp-cal-day-summary")!.textContent).not.toContain("all-day");
  });

  it("recognizes conservative title keywords and keeps explicit icons ahead of suggestions", () => {
    const target = resetDom();
    renderCalendarLayout({target,now,settings:{automaticEventIcons:true},events:[
      timed("Zahnarzt", "12:00"), timed("[icon:shopping] Doctor", "13:00"),
      {...timed("Birthday", "14:00"),description:"[icon:phone]"},timed("Callback implementation", "15:00"),
      timed("Unbekannter Termin", "16:00")
    ]});
    expect([...target.querySelectorAll(".pp-cal-event-icon")].map(n=>(n as HTMLElement).dataset.icon)).toEqual(["healthcare","shopping-bag","phone"]);
    expect(target.textContent).not.toContain("[icon:");
    expect(target.querySelectorAll("svg")).toHaveLength(3);
  });

  it("respects icon switches and escapes personal text", () => {
    const target = resetDom();
    renderCalendarLayout({target,now,settings:{automaticEventIcons:true,showEventIcons:false,personalTitle:'<img src=x onerror=alert(1)>',personalSubtitle:'Our <week>'},events:[timed("Doctor", "12:00")]});
    expect(target.querySelector(".pp-cal-event-icon")).toBeNull();
    expect(target.querySelector(".pp-cal-title")!.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(target.querySelector(".pp-cal-header img")).toBeNull();
    renderCalendarLayout({target,now,settings:{showHeader:false,personalTitle:"Hidden",showDaySummary:true}});
    expect(target.querySelector(".pp-cal-header")).toBeNull();
    expect(target.querySelector(".pp-cal-day-summary")).not.toBeNull();
  });

  it("keeps legacy defaults and clears optional state on the next payload", () => {
    const target = resetDom();
    renderCalendarLayout({target,now,settings:{showDaySummary:true,personalTitle:"Our week",informationDensity:"compact"}});
    fitCalendarLayout(target);
    fitCalendarLayout(target);
    expect(target.style.getPropertyValue("--pp-cal-font-scale")).toBe("0.88");
    renderCalendarLayout({target,now});
    fitCalendarLayout(target);
    expect(target.querySelector(".pp-cal-day-summary")).toBeNull();
    expect(target.querySelector(".pp-cal-header")).toBeNull();
    expect(target.dataset.informationDensity).toBe("comfortable");
    expect(target.style.getPropertyValue("--pp-cal-font-scale")).toBe("1");
    expect(summary([])).toContain("No more timed events today");
    expect(normalizeCalendarSettings({informationDensity:"invalid",showDaySummary:"false",automaticEventIcons:"true"})).toMatchObject({informationDensity:"comfortable",showDaySummary:false,automaticEventIcons:true});
  });
});

describe("minimal day timeline", () => {
  const now = "2026-07-24T12:45:00Z";
  const settings = {view:"day-timeline",locale:"de-DE",timeZone:"Europe/Berlin"};
  const event = (title: string, from: string, to?: string) => ({title,start:{dateTime:`2026-07-24T${from}:00+02:00`},...(to ? {end:{dateTime:`2026-07-24T${to}:00+02:00`}} : {})});
  it("uses one local day and keeps deadlines out of its time scale", () => {
    expect(buildCalendarRange(settings,now).dateKeys).toEqual(["2026-07-24"]);
    const target=resetDom();
    renderCalendarLayout({target,now,settings,events:[event("Workshop","14:00","16:00"),event("[todo] Submit draft","23:59","23:59")]});
    expect(target.querySelectorAll(".pp-cal-timeline-slot")).toHaveLength(1);
    expect(target.querySelector(".pp-cal-timeline-grid")?.getAttribute("data-end")).toBe("1080");
    expect(target.querySelector(".pp-cal-timeline-side-list")!.textContent).toContain("Submit draft");
    expect(target.textContent).not.toContain("[todo]");
    expect(target.querySelectorAll(".pp-cal-task-box")).toHaveLength(0);
    expect(target.querySelectorAll("[data-timeline-row]")).toHaveLength(1);
  });
  it("features the next appointment while marking an ongoing one in the timeline", () => {
    const target=resetDom();
    renderCalendarLayout({target,now,settings,events:[event("Current","14:00","16:00"),event("Next","19:00","21:00")]});
    expect(target.querySelector(".pp-cal-timeline-next")!.textContent).toContain("Next");
    expect(target.querySelector(".pp-cal-timeline-clock")!.textContent).toBe("19:00");
    expect(target.querySelector(".is-current")!.textContent).toContain("Current");
    expect(target.querySelector(".pp-cal-timeline-now")!.textContent).toBe("Now");
  });
  it("merges overlapping commitments before labeling gaps and suppresses uncertain gaps", () => {
    const target=resetDom();
    const events=[event("One","09:00","11:00"),event("Overlap","10:00","12:00"),event("Next","14:00","15:00")];
    renderCalendarLayout({target,now,settings,events});
    expect(target.querySelectorAll(".pp-cal-timeline-gap")).toHaveLength(1);
    expect(target.querySelector(".pp-cal-timeline-gap")!.textContent).toContain("2 Std.");
    renderCalendarLayout({target,now,settings,events:[...events,event("Unknown end","12:30")]});
    expect(target.querySelector(".pp-cal-timeline-gap")).toBeNull();
    renderCalendarLayout({target,now,settings,events:[...events,{title:"Away",start:{date:"2026-07-24"}}]});
    expect(target.querySelector(".pp-cal-timeline-gap")).toBeNull();
  });
  it("honors optional panels and retains tasks when the sidebar is disabled", () => {
    const target=resetDom();
    renderCalendarLayout({target,now,settings:{...settings,timelineShowSidebar:false,timelineShowNow:false,timelineShowGaps:false},events:[event("One","09:00","10:00"),event("Two","14:00","15:00"),event("[todo] Task","23:00")]});
    expect(target.querySelector(".pp-cal-timeline-sidebar")).toBeNull();
    expect(target.querySelector(".pp-cal-timeline-now")).toBeNull();
    expect(target.querySelector(".pp-cal-timeline-gap")).toBeNull();
    expect(target.querySelector(".pp-cal-timeline-inline")!.textContent).toContain("Task");
    expect(normalizeCalendarSettings({timelineGapMinutes:1,timelineShowNow:"false"})).toMatchObject({timelineGapMinutes:15,timelineShowNow:false});
  });
  it("uses local civil dates for overnight events and does not include tomorrow's tasks", () => {
    const target=resetDom();
    renderCalendarLayout({target,now:"2026-10-24T22:15:00Z",settings,events:[
      {title:"Night",start:{dateTime:"2026-10-24T21:00:00Z"},end:{dateTime:"2026-10-25T03:00:00Z"}},
      {title:"[todo] Tomorrow",start:{date:"2026-10-26"}}
    ]});
    expect(target.querySelector(".pp-cal-timeline-slot")?.getAttribute("data-start")).toBe("0");
    expect(target.textContent).not.toContain("Tomorrow");
    expect(target.querySelector(".pp-cal-timeline-heading")!.textContent).toContain("25. Oktober");
  });
  it("counts events and tasks omitted by the configured maximum", () => {
    const target=resetDom();
    renderCalendarLayout({target,now,settings:{...settings,maxEvents:1},events:[event("One","09:00","10:00"),event("Two","11:00","12:00"),event("[todo] A","16:00"),event("[todo] B","17:00")]});
    expect(target.querySelectorAll(".pp-cal-timeline-slot")).toHaveLength(1);
    expect(target.querySelector(".pp-cal-timeline-overflow")?.getAttribute("data-base-count")).toBe("1");
    expect(target.querySelector(".pp-cal-timeline-side-list .pp-cal-modern-more")?.getAttribute("data-base-count")).toBe("1");
  });
});
