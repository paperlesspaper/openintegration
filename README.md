# @paperlesspaper/openintegration

Tiny helper toolkit and local CLI for static paperlesspaper OpenIntegration pages.

This package is intentionally boring: no React, no generated app lifecycle, and no `createRenderApp()`. Your integration stays a small website with a `config.json`, a `render.html`, and optionally an API route. The CLI provides the pieces needed to scaffold, validate, preview, and render those files locally.

## Install

```sh
npm install --save-dev @paperlesspaper/openintegration
```

After installing the package in your integration folder, npm can resolve the local `paperless` binary:

```sh
npx paperless dev
```

For a one-off run without installing it locally, point npx at the scoped package explicitly:

```sh
npx --package @paperlesspaper/openintegration paperless dev
```

Plain `npx paperless ...` only works with a local install. Otherwise npm tries the unrelated `paperless` package from the registry.

For no-build integrations, copy these files from `dist/` into your integration folder:

```txt
paperless.css
paperless.js
paperless.iife.js
```

## Dev preview

Create a starter integration:

```sh
paperless scaffold ./my-integration --name "My Integration"
```

Use `--no-api` for a static-only starter. By default the scaffold includes `api/data.js`, because most integrations need a small data adapter between external APIs and the render page.

Run a local paperlesspaper host simulator for an integration:

```sh
paperless dev
```

By default, `dev`, `check`, and `render` use `./config.json` when no path is provided.

During package development, you can run it from this repository:

```sh
npm run dev -- ../paperlesspaper-integrations/openintegrations/applications/quote/config.json
```

The preview serves the integration folder, validates `config.json`, opens a host page at `http://127.0.0.1:4300/__paperless/preview`, sends an `INIT` payload to the render iframe, generates sidebar inputs from `formSchema`, embeds `settingsPage` when configured, lets you edit raw `meta.pluginSettings`, caches preview values in `localStorage` with a reset button, and watches for `#website-has-loaded`.

The renderer panel can show either the raw Chrome/Puppeteer screenshot or the production-like `epdoptimize` output. Current sidebar settings and color are passed to the render page through the `INIT` payload; color is also mirrored into `meta.pluginSettings.color` automatically. Both render outputs replace the iframe in the main device preview, and Download saves the currently shown PNG.

Render pages can tune `epdoptimize` with a meta tag:

```html
<meta name="paperless:epd-optimize" content='{"intent":"vivid"}' />
```

Supported intents are `natural`, `vivid`, `readable`, `faithful`, and `lowNoise`. The page may update this tag before calling `markReady()`. Use `content='{"enabled":false}'` when a page wants the EPD render path to return the raw Puppeteer screenshot.

The content may also select a built-in `epdoptimize` palette export and override image/dither options:

```html
<meta
  name="paperless:epd-optimize"
  content='{"palette":"spectra6OriginalPalette","canvasDitherOptions":{"ditheringType":"quantizationOnly"}}'
/>
```

It also watches the integration folder and live-reloads the preview when files change. Disable that with:

```sh
paperless dev --no-watch
```

Validate an integration without opening the browser:

```sh
paperless check
```

Use `--json` for machine-readable check output in CI.

Render an integration through local Chrome/Puppeteer and `epdoptimize`:

```sh
paperless render --viewport 800x480 --output render.png
```

Use `--raw` to write the unoptimized Puppeteer screenshot. The interactive preview includes separate Puppeteer and EPD buttons that call the same local render endpoint, plus a Live button to switch the main preview back to the iframe.

The recommended generation loop is:

```sh
paperless scaffold ./applications/example --name "Example"
paperless check ./applications/example/config.json
paperless render ./applications/example/config.json --viewport 800x480 --output /tmp/example-landscape.png
paperless render ./applications/example/config.json --viewport 480x800 --output /tmp/example-portrait.png
paperless dev ./applications/example/config.json
```

## CLI development

The CLI entry point is `src/cli.ts` and is published as the `paperless` binary from `dist/cli.js`. The old `paperlesspaper-openintegration` binary remains available as an alias. Build it with:

```sh
npm run build
```

During package development, use `npm run dev -- <config.json>` to rebuild and run the local `dev` command in one step. To run another command against the freshly built CLI, call Node directly:

```sh
npm run build
node dist/cli.js check ../paperlesspaper-integrations/openintegrations/applications/quote/config.json
node dist/cli.js render ../paperlesspaper-integrations/openintegrations/applications/quote/config.json --viewport 800x480 --output /tmp/quote.png
```

The CLI is split across a few small modules:

- `src/cli.ts`: argument parsing, command dispatch, direct `render` output handling.
- `src/devServer.ts`: local host simulator, static file serving, `api/*.js` handlers, live reload, preview render endpoints.
- `src/devCheck.ts`: config, page, language, schema, and API handler validation.
- `src/scaffold.ts`: starter integration templates.
- `src/puppeteerRender.ts` and `src/epdOptimize.ts`: screenshot capture and production-like Spectra 6 optimization used by preview rendering.

`render` and the preview render buttons need a local Chrome executable. The resolver checks `--chrome-bin`, then `CHROME_BIN`, then `PUPPETEER_EXECUTABLE_PATH`, and on macOS falls back to `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.

The dev server exposes internal endpoints under `/__paperless/*`: `/__paperless/preview` for the host simulator, `/__paperless/render` for PNG rendering, `/__paperless/events` for live reload, `/__paperless/health` for probes, and `/__paperless/config-variants/regenerate` for screenshot variants declared in `config.json`.

Before publishing or changing CLI behavior, run:

```sh
npm run build
npm test
npm run typecheck
```

## LLM integration contract

When generating a new integration, create a small folder with this shape:

```txt
my-integration/
  config.json
  render.html
  languages/de.json # optional, when config.language includes "de"
  languages/en.json # optional, when config.language includes "en"
  api/data.js      # optional, but recommended for API/data normalization
  README.md        # optional
  assets/...       # optional static images or icons
```

Rules that keep generated integrations compatible:

- `config.json` must include `name`, `version`, and `renderPage`.
- Prefer `renderPage: "./render.html"` and relative asset/API paths.
- Add an `icon` path such as `"./assets/icon.png"` when the integration has a custom icon.
- Declare supported UI languages with `language: ["de", "en"]` and provide matching JSON object files at `languages/<code>.json`.
- Put every user-editable setting in both `nativeSettings` and `formSchema.properties`.
- Do not duplicate host language in `nativeSettings` or `formSchema`; render pages read it from `payload.meta.language`.
- Put global defaults such as `color` in `nativeSettings`, but do not add `color` to `formSchema.properties`; the host and CLI preview provide the global color control.
- If a setting is edited by a custom `settingsPage`, add `"inStettingsPage": true` to that `formSchema.properties.<name>` entry so the CLI preview does not also show it in the generated form.
- Use `""` for empty string settings instead of `null` when the setting is a text filter.
- Keep API handlers as default-exported async functions in `api/*.js`. The dev server calls them with `{ query, request }` and serves the returned value as JSON. `GET` query parameters remain supported; a same-origin `POST` with a JSON object merges that body into `query` (body values win, 64 KB limit). Prefer the JSON body for feed URLs, app passwords, client secrets, and other values that should not appear in request URLs.
- In `render.html`, put DOM updates in an async `renderPayload(payload)` function. Wait for the first `INIT` with `waitForPayload({ onUpdate: renderPayload })`, load copy with `loadLanguageJson(payload)` when localized text is used, merge defaults with `getSettings(payload)` and `getQuerySettings()`, render DOM, optionally set `<meta name="paperless:epd-optimize" content='{"intent":"readable"}' />`, wait for fonts/images if needed, fit content, then call `markReady()`. The `onUpdate` callback receives later preview `INIT` messages without reloading the iframe.
- Wrap the render logic in `try/catch` and call `markError(error)` on failure.
- Escape untrusted strings with `escapeHtml()` before injecting HTML.
- Add `<div id="website-has-loading-element"></div>` at startup. `markReady()` removes it and adds `#website-has-loaded`.
- Treat `color` as a global setting: include it in config and render defaults, merge it with `getSettings(payload)` and `getQuerySettings()`, then apply the resolved value with `applyColorTheme()` so host defaults and preview/query overrides all work.
- Do not repeat global body defaults in render pages. `paperless.css` already sets `html`/`body` sizing, overflow, `body { background: var(--pp-bg); color: var(--pp-fg); font-family: var(--pp-font); }`, and form-control font inheritance. Only override background, foreground, or font family locally when the integration intentionally needs a branded or mode-specific design.
- Use theme variables from the element that receives the theme class. `applyColorTheme()` applies classes to `document.body` by default, so generated CSS should use `--pp-bg`, `--pp-fg`, `--pp-muted`, `--pp-border`, `--pp-card`, and `--pp-accent` directly in component rules. Do not alias these variables on `:root`, because those aliases can resolve before the `body` theme class takes effect.
- Design for fixed color eInk frames. paperlesspaper displays support the six Spectra 6 colors, so do not assume monochrome-only rendering.
- Prefer high-contrast layouts, intentional color accents, real CSS media queries for orientation, and deterministic data limits so text cannot grow without bound.

Minimal render flow for generated pages:

```js
const defaults = {
  // Add integration-specific defaults here too.
  color: "light"
};

async function renderPayload(payload) {
  markLoading();
  const { messages } = await loadLanguageJson(payload);
  const settings = mergeSettings(defaults, getSettings(payload), getQuerySettings());
  applyColorTheme(settings.color, { defaultTheme: defaults.color });

  // Fetch/prepare data, update the DOM, then:
  await document.fonts?.ready;
  fitAllText();
  fitToScreen(document.querySelector("#app"));
  markReady();
}

const payload = await waitForPayload({ timeoutMs: 500, onUpdate: renderPayload });
await renderPayload(payload);
```

## Integration icons

Icons are shown in the integration list, settings, and the local preview chrome. Use a square PNG with a transparent background; `1024x1024` is recommended. Store it with the integration, for example at `assets/icon.png`, and reference it from `config.json`:

```json
{
  "icon": "./assets/icon.png"
}
```

Keep the icon shape simple, centered, and readable at small sizes. Avoid text, shadows outside the icon, and busy backgrounds. The current icon guide is available at <https://docs.paperlesspaper.de/open-integration/icons>.

Prompt template for generated icons:

```txt
A high-resolution 2D digital icon for an integration for the paperlesspaper eInk display that can YOUR USECASE, featuring slightly 3D shading and highlights to give it depth.

The icon has smooth, beveled edges and appears realistic but minimalistic. The image is viewed from the top. The background is fully transparent, with no shadows or surrounding elements, suitable for use as an icon or in UI design.
```

## Language JSON

An integration can advertise supported languages in `config.json`:

```json
{
  "language": ["de", "en", "fr", "es", "it"]
}
```

For each declared code, add a JSON object at `languages/<code>.json`:

```json
{
  "title": "Daily XKCD",
  "footerPrefix": "Alt text"
}
```

The host-selected language is delivered as `payload.meta.language`. The CLI preview and render command accept `--language <code>`; the preview also shows a language selector when `config.language` is present. If no language is provided, the first declared language is used. Integrations without `config.language` keep the legacy `"de"` default.

Use `loadLanguageJson(payload)` in `render.html`. It resolves exact language codes first, then base codes such as `de-DE -> de`, then the default language, and fetches `languages/<resolved>.json`. `paperless check` verifies that every declared language file exists, parses as JSON, and contains an object.

Set the optional top-level `timezone` field to an IANA timezone such as `Europe/Berlin` when the render page should observe a specific local time. Puppeteer applies it before loading the render page; when omitted, the renderer keeps its system timezone.

## Minimal config.json

```json
{
  "name": "daily-xkcd",
  "version": "1.0.0",
  "description": "Show an XKCD comic on a paperlesspaper display.",
  "timezone": "Europe/Berlin",
  "renderPage": "render.html",
  "language": ["de", "en"],
  "nativeSettings": {
    "color": "light",
    "kind": "latest",
    "difference": 0
  },
  "formSchema": {
    "type": "object",
    "properties": {
      "kind": {
        "type": "string",
        "enum": ["latest", "random"]
      },
      "difference": {
        "type": "number"
      }
    }
  }
}
```

Generated settings forms support the standard JSON Schema primitive `type` values `string`, `number`,
`integer`, `boolean`, `array`, and `object`. Strings can opt into richer inputs with `format`: use
`date`, `time`, `date-time`/`datetime-local`, `email`, `uri`/`url`, `password`, `color`, `tel`,
`month`, `week`, or `textarea`. Number inputs honor `minimum`, `maximum`, and `step`; string inputs honor
`minLength`, `maxLength`, `pattern`, and `placeholder`.

## Static render.html

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="paperless:epd-optimize" content='{"intent":"readable"}' />
    <title>Daily XKCD</title>
    <link rel="stylesheet" href="./paperless.css" />
  </head>
  <body>
    <div id="website-has-loading-element"></div>

    <main id="app" class="pp-screen">
      <p>Loading...</p>
    </main>

    <script type="module">
      import {
        waitForPayload,
        getSettings,
        getQuerySettings,
        mergeSettings,
        loadLanguageJson,
        applyColorTheme,
        markLoading,
        markReady,
        markError,
        fitAllText,
        fitToScreen,
        escapeHtml
      } from "./paperless.js";

      const app = document.querySelector("#app");

      async function renderPayload(payload) {
        try {
          markLoading();
          const { messages } = await loadLanguageJson(payload);
          const defaults = { color: "light", kind: "latest", difference: 0 };
          const settings = mergeSettings(
            defaults,
            getSettings(payload),
            getQuerySettings()
          );
          applyColorTheme(settings.color, { defaultTheme: defaults.color });

          const response = await fetch(new URL("./api/data", window.location.href), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind: settings.kind, difference: settings.difference })
          });
          const comic = await response.json();
          const footerPrefix = typeof messages.footerPrefix === "string"
            ? messages.footerPrefix
            : "";

          app.innerHTML = `
          <section class="pp-header">
            <div>
              <h1 class="pp-title pp-fit">${escapeHtml(comic.title)}</h1>
              <p class="pp-subtitle">xkcd #${escapeHtml(comic.num)}</p>
            </div>
          </section>

          <section class="pp-image-frame" style="flex: 1">
            <img src="${escapeHtml(comic.img)}" alt="${escapeHtml(comic.alt)}" />
          </section>

          <footer class="pp-footer">${escapeHtml(footerPrefix ? `${footerPrefix}: ${comic.alt}` : comic.alt)}</footer>
        `;

          await document.fonts?.ready;
          fitAllText();
          fitToScreen(app);
          markReady();
        } catch (error) {
          markError(error);
        }
      }

      const payload = await waitForPayload({ timeoutMs: 500, onUpdate: renderPayload });
      await renderPayload(payload);
    </script>
  </body>
</html>
```

## IIFE usage

```html
<script src="./paperless.iife.js"></script>
<script>
  const { markReady, markError } = window.PaperlessOpenIntegration;
</script>
```

## Helpers

- `markLoading()`
- `markReady()`
- `markError(error?)`
- `waitForPayload({ timeoutMs?, fallback?, allowedOrigins?, onUpdate? })`
- `getSettings(payload?, defaults?)`
- `getQuerySettings(defaults?)`
- `mergeSettings(...sources)`
- `getPayloadLanguage(payload?)`
- `resolveLanguage({ requested?, supported?, defaultLanguage? })`
- `loadLanguageJson(payload?, { supported?, defaultLanguage?, basePath?, fetch? })`
- `applyColorTheme(value?, { defaultTheme?, target? })`
- `applyColorThemeFromQuery({ paramName?, defaultTheme?, target? })`
- `fitText(element, options?)`
- `fitAllText(selector?, options?)`
- `hyphenateText(value, options?)`
- `addSoftHyphensToTextNodes(root, options?)`
- `prepareHyphenation(element, options?)`
- `fitHyphenatedText(element, options?)`
- `fitToScreen(element?, options?)`
- `detectOverflow(root?)`
- `fitImage(image, mode?)`
- `escapeHtml(value)`
- `normalizeCalendarSettings(settings?, defaults?)`
- `buildCalendarRange(settings?, now?)`
- `prepareCalendarEvents(events, settings?, now?)`
- `renderCalendarLayout(options?)`
- `fitCalendarLayout(layout, options?)`
- `waitForCalendarImages(layout, timeoutMs?)`
- `bootCalendarApiIntegration(options)`
- `validateConfig(config)`

## Illustrated daily cards

Use `renderOfTheDayLayout()`, `waitForOfTheDayImage()` and `fitOfTheDayLayout()` for
illustrated tree/train/bird/spacecraft/fish/dinosaur-style daily cards. Keep item selection
and localization in the integration; the shared runtime owns layout, image containment,
responsive type, fact capacity and refitting after viewport changes.

Use `layout: "auto"`, declare `textSize` (`small`, `middle`, `big`), `showHeader`, and the optional
`showFactCount` / `showRotationCount` switches (both default to false), and
pass a localized `factsShown` template (`"{shown} of {total} facts"`) without substituting
its placeholders early. Fact order defines display priority. On a constrained display the
renderer shows a bounded subset of complete facts with an opt-in count; it restores
additional selected facts when a larger viewport can accommodate them. All facts deselected
means no facts. Header disabled plus no facts gives an image-only view.

Always wait for fonts and image decoding before fitting. Verify the returned `hasOverflow`
and test 800x480, 480x800, 1600x1200 and 1200x1600 with long localized content, all text sizes,
all/no facts and header/theme variants. Do not use whole-screen scaling, negative image
translations or tiny-font overrides to compensate for a bad layout. The image box must fit
its allocated stage; `object-fit: contain` alone is not a box-sizing guarantee.

See [the illustrated daily-card guide](./of-the-day-integrations.md) for the rendering
example, concrete type and image budgets, asset guidance and generation acceptance matrix.

## Shared calendar layouts

Calendar integrations should keep authentication, API requests, recurrence expansion, and
provider-specific field parsing in a small adapter. The adapter maps every result to the shared
event shape and hands it to `renderCalendarLayout()`. The runtime owns date ranges, timezone-safe
grouping, sorting, empty states, all shared views, optional locations/icons/images, responsive CSS,
and fitting. `noPadding: true` removes the outer calendar spacing in every view
and the outer week-grid borders, while preserving internal separators.
`fullWeekdayNames: true` spells out localized weekdays in day, three-day, and week headers.
Both options default to `false`. `fontSize` adjusts typography from 75 to 150 percent
(default: 100). Dense non-week views may reduce text to fit the available space. The week view uses dashed row and column separators,
including the all-day row; blue, yellow, and red event fills have no outline.

```js
const settings = normalizeCalendarSettings({
  ...getSettings(payload),
  ...getQuerySettings()
});

const events = providerEvents.map((event) => ({
  id: event.id,
  title: event.subject,
  start: {
    date: event.allDayDate, // YYYY-MM-DD; use either date or dateTime
    dateTime: event.startDateTime, // ISO 8601, ideally with an offset
    timeZone: event.timeZone
  },
  end: {
    date: event.allDayEndDate,
    dateTime: event.endDateTime,
    timeZone: event.timeZone
  },
  location: event.location,
  iconName: event.iconName,
  imageUrl: event.imageUrl,
  details: [{ label: "Role", value: event.role }]
}));

const layout = renderCalendarLayout({
  target: "#app",
  events,
  settings,
  messages,
  header: { title: "Calendar", source: "Provider name" }
});

await document.fonts?.ready;
await waitForCalendarImages(layout);
fitCalendarLayout(layout);
```

The `week` view is a Monday-to-Sunday time grid in both orientations. It places timed events
by their local start time and duration, splits overlapping appointments into columns, and keeps
all-day events in a separate, bounded strip above the grid. The displayed hours cover at least
08:00–18:00 and expand to include earlier/later appointments. Events without an end use a
30-minute display duration. Overnight events continue on the following day. Short appointments
prioritize their title and have a small minimum height for legibility. Collision layout also
accounts for that visual height, including after a viewport resize. The redundant today
banner and range title are omitted in this view; today is marked in the day header instead.
The provider header remains available, in a compact style. `maxEvents` applies per day, with an
explicit overflow count; the all-day strip shows at most two entries per day plus a count.

Events may include `color` (event override) and `calendarColor` (parent calendar fallback),
as a CSS named color or hex RGB/RGBA string. The renderer maps source hues to high-contrast
Spectra 6 pigments and selects black/white event text; it never injects raw provider CSS.
Missing or invalid event colors fall back to calendar color, then the chosen global theme.
Week blocks and all-day chips use the fill; other event views use a colored side marker.
The surrounding layout and today indicator retain the global theme. Colored week views
select the native Spectra 6 output palette with error diffusion so green blocks do not
quantize to yellow; the prior EPD settings are restored when leaving that view. API-backed calendars
can return top-level `calendarColor`; it takes precedence over an ICS calendar fallback.
The shared ICS parser preserves VCALENDAR `COLOR` / `X-APPLE-CALENDAR-COLOR`, VEVENT `COLOR`,
and inherited colors on recurrence exceptions.

The canonical views are `agenda`, `agenda-modern`, `today-next`, `day`, `three-days`,
`week`, `rolling-week-list`, `rolling-week`, and `year`. Common settings are
`locale`, `timeZone`, `dayRange`, `maxEvents`, `highlightToday`, `highlightScale`, `showLocation`,
`showEventIcons`, `showEventImages`, `noPadding`, and `fullWeekdayNames`. For compatibility, normalization also accepts `language`
as an alias for `locale`, `daysAhead` for `dayRange`, and common three-day view spellings.

Use `start.date` for all-day values to preserve the provider's civil date without a UTC shift.
Use an ISO value in `start.dateTime` for timed events and include the provider timezone when it is
known. The configured `timeZone` is authoritative for timed-event grouping and clock display; an
event timezone is only a fallback when no display timezone is configured. Events with an exclusive
`end.date` or an `end.dateTime` are repeated on every visible civil day they overlap. Treat
`maxEvents` as a presentation limit and keep a separate, bounded adapter fetch/parse limit so week
and year views receive the complete requested range. Do not pass provider HTML to the shared renderer: it escapes all displayed fields, while the
adapter remains responsible for extracting and validating any image URL or icon metadata.

Server adapters that receive iCalendar data can import the recurrence-aware parser from the
server-only subpath (it is intentionally excluded from `paperless.iife.js`):

```js
import { parseICalendar } from "@paperlesspaper/openintegration/ical";

const events = parseICalendar(icsText, {
  rangeStart: "2026-07-22",
  rangeEndExclusive: "2026-08-05",
  timeZone: "Europe/Berlin"
});
```

The parser returns the same canonical `CalendarEvent[]` shape. It supports date-only and timed
values, floating and bundled timezone definitions, `DTEND`/duration, recurrence rules and dates,
exclusions, moved or cancelled exceptions, and bounded expansion. Use its event and occurrence
limits together with adapter-level request timeouts and response-size limits.

Canonical API-backed calendars can reduce their render page to a defaults object and one boot call:

```js
window.__paperlessRenderDone = bootCalendarApiIntegration({
  defaults: {
    color: "light",
    title: "My Calendar",
    view: "agenda",
    locale: "en-US",
    timeZone: "Europe/Berlin",
    dayRange: 14,
    maxEvents: 12,
    showHeader: true,
    showLocation: true
  }
});
```

The API returns `{ events, calendarName?, source?, sample? }` using the canonical event shape.
The helper sends settings to the same-origin `./api/data` route as a JSON POST body, keeping feed
URLs and app passwords out of request URLs. It also owns payload updates, localization, theme,
the shared views, font/image settling, fitting, and ready/error markers. Use `mapEvents`,
`buildRequest`, or `resolveHeader` only when a provider needs a thin adapter around that contract.

## Color themes

`paperless.css` exposes app-style theme class names using only the six full Spectra 6 device colors internally:

```txt
dark, light, red-dark, red-light, blue-dark, blue-light, green-dark, green-light
```

Generated render pages should treat `color` as a global setting with a local default, merge it from the host payload and query string, then call `applyColorTheme(settings.color, { defaultTheme: defaults.color })`. For query-only static pages, `applyColorThemeFromQuery()` is a shortcut that reads `?color=` and applies the theme to `document.body`. The CSS exposes both the openintegration variables (`--pp-bg`, `--pp-fg`, `--pp-muted`, `--pp-border`, `--pp-card`, `--pp-accent`) and the app-style aliases (`--background`, `--foreground`, `--muted`, `--card-border`, `--accent`).

Because the theme class is applied to `body`, custom CSS should consume those variables directly in rules under the themed element, for example `background: var(--pp-bg)` and `color: var(--pp-fg)`. Avoid creating theme-dependent aliases on `:root`, such as `--panel-bg: var(--pp-bg)`, then using `var(--panel-bg)` inside the app. Root aliases are resolved from the root scope and can keep the default colors even after the body theme changes. If an alias is useful for readability, define it on the themed component, such as `.my-screen { --panel-bg: var(--pp-bg); }`.

The base stylesheet already applies the resolved theme to the page chrome with `body { background: var(--pp-bg); color: var(--pp-fg); font-family: var(--pp-font); }`, plus matching `html` sizing/background and inherited fonts for form controls. Render pages should not restate those defaults on `body` or the top-level screen. Local background, color, and font declarations are reserved for deliberate overrides, such as a photo viewer with a fixed black canvas or a branded editorial layout.

## Plain CSS orientation

The upstream `mixins.scss` is just direct orientation media queries. In plain CSS, write the wrapped styles explicitly:

```css
@media (orientation: portrait) {
  /* equivalent to @include horizontal */
}

@media (orientation: landscape) {
  /* equivalent to @include vertical */
}
```

### Optional calendar designs

`agenda-modern` and `today-next` are opt-in views; existing defaults and classic views
are unchanged. Both use the agenda `dayRange` and the configured display timezone.
`agenda-modern` groups appointments under large day numbers with open spacing.
`today-next` separates today from upcoming days, emphasizing the first ongoing or
future timed appointment (30-minute fallback when an end time is absent).
In this view `maxEvents` applies separately to today and to the upcoming list.
Earlier and all-day appointments remain in the today list. When space is constrained,
these views remove whole trailing appointments and show a localized additional-event
count rather than scaling the entire display. Hidden entries are restored on resize.
Add `tomorrow`, `nextEvent`, `ongoing`, and `later` to the integration language JSON;
the standard API boot helper forwards these labels. The global color theme controls
headings, while provider colors remain small event markers. Inspect both orientations
and production-like Spectra 6 output before promoting either view to a default.

### Rolling seven-day views

`rolling-week-list` and `rolling-week` always show the current local day plus six
following days, independent of `dayRange`. They are optional views and do not
change the Monday-first `week` view. Both honor timezone, locale and global theme.
The list view retains empty days, applies `maxEvents` per day and removes complete
trailing entries with an additional-event count when space runs out. Landscape uses
seven columns; portrait uses seven rows. The time grid reuses week overlap/all-day
handling and splits into four plus three days in portrait, with a shared hour scale.
Only one responsive arrangement is visible at a time. Week grids are fitted separately
on resize, including minimum-height collision placement for short appointments.

### Optional personal calendar features

All seven calendar integrations share these independently configurable options:

| Setting | Default | Behavior |
| --- | --- | --- |
| `showDaySummary` | `false` | Remaining timed appointments (including ongoing ones), separate all-day count, next appointment and last known end today. Uses the selected timezone and shows the render/update time. |
| `automaticEventIcons` | `false` | Local German/English title rules suggest icons for birthdays, medical appointments, flights, school, shopping, calls, music, cinema, cycling, coffee and meetings. Unknown titles keep their plain appearance. |
| `showEventIcons` | `true` | Master switch for manual and automatic icons. Explicit `iconName` or `[icon:…]` takes priority over suggestions. |
| `showHeader` | `true` | Hide or show the entire provider/personal header, independently of the day summary. |
| `personalTitle` / `personalSubtitle` | empty | Override the existing heading/subtitle. Blank values retain provider defaults. Text only; maximum 100/160 characters. |
| `informationDensity` | `comfortable` | `comfortable` preserves the standard layout. `automatic` measures available space using shared `fitText`; `compact` reduces type and spacing, `spacious` enlarges them. The existing `fontSize` setting remains effective. |

Agenda, day columns, modern agenda, Today & next and rolling lists show `+ more` for whole appointments that cannot fit. Automatic modern and rolling lists grow/shrink text within a bounded range before hiding entries; classic views reuse their existing text fitting with counted overflow, while time grids retain proportional time geometry. Resizing recomputes fitting and restores entries when space becomes available. No locations or event images are silently disabled by the density setting.

The day summary uses all loaded events for today before the display's `maxEvents` limit. Ended events are excluded; an appointment without an end is counted until its start time. Missing end times, overnight appointments and all-day events suppress the last-end statement. The summary describes the loaded calendar data, not availability across other accounts; it updates when the host renders fresh data, with no per-minute display refresh.

Common icons are bundled SVG artwork and work offline. Other explicit Iconoir names use the integration's existing Iconoir stylesheet. Google accepts manual tokens in the title and description; iCalendar feeds preserve description tokens too. Outlook title tokens work without requesting extra description fields. Suggestions never rewrite source events or send titles to an external service.

Suggested setup: modern agenda or Today & next, `showDaySummary: true`, `automaticEventIcons: true`, `informationDensity: "automatic"`, and your own title. Extra features are opt-in so existing displays keep their presentation.

## Departure boards

`bootDepartureIntegration({ defaults, brand, timeZone, locale? })` provides the
shared DB/SBB station header, next departure, time/line/destination/platform rows,
localized delay/cancellation labels, platform changes and counted overflow.
The same-origin JSON POST adapter returns `DepartureBoardData`; provider lookup
and filters remain in the integration. Existing locale, timezone and theme
settings are honored. Unknown delay values stay unknown, and cancelled services
keep an explicit written label in both orientations.

`renderDepartureBoard()` and `fitDepartureBoard()` are also available separately.
The scoped `.pp-departures` styles give clipped text a 1.4 line height plus ink
padding, preserving descenders such as the g in Niederweningen. Long names use
ellipsis or two lines; fitting removes complete trailing rows and reports their
count, restoring them on resize. It does not scale down the entire display.

## Connected dashboards

`bootDashboardIntegration({ defaults, apiPath? })` renders same-origin JSON POST responses
using shared metric, list, board, chart and contribution-calendar layouts. Providers return
`DashboardData` with `metrics`, `rows`, `columns`, `chart`, or `heatmap`, plus `source`,
`updatedAt`, `sample`, `partial`, and `note`. Numeric `null` values remain unknown (`—`).
The helper owns INIT updates, request cancellation, localization, theme, fonts, ready/error
markers and fitting. `fitDashboard()` hides complete trailing rows and discloses their count;
resizing restores them before measuring again. Provider adapters must bound fetches, sanitize
source fields and distinguish snapshots, forecasts and observations. The renderer does not
interpret provider statuses or invent missing measurements.

### Minimal day timeline

Select **Day timeline (minimal)** (`view: "day-timeline"`) under **View & design**. The layout shows the current local day with a proportional time axis, native-color event rails, overlapping appointments in separate lanes and a large next-event time. In portrait, the next event and due list move below the timeline. Source calendar colors and the global light/dark theme remain active.

The visual reference is [Clean minimal calendar plugin by iUnstable0](https://www.reddit.com/r/trmnl/comments/1xhfqqt/clean_minimal_calendar_plugin/). This is an independent implementation in the shared paperlesspaper renderer; it does not use the reference project's code or server.

| Option | Default | Behavior |
| --- | --- | --- |
| `timelineShowSidebar` | `true` | Next appointment plus due/all-day list. When disabled, due/all-day entries remain above the time axis. |
| `timelineShowNow` | `true` | Red “Now” marker at render time, without a numeric clock label. It refreshes with the calendar, not continuously. |
| `timelineShowGaps` | `true` | Labels gaps between known timed commitments. All-day events, unknown end times and DST-crossing intervals suppress these labels. |
| `timelineGapMinutes` | `30` | Minimum labeled gap, configurable from 15 to 240 minutes. |

Mark a calendar event with `[todo]` in its title to put it in **Due today**. Its start/date is its due time. Google and iCalendar feeds also accept the marker in the event description. Host adapters may supply `kind: "task"` in the canonical event shape. These are read-only calendar deadlines, not a connection to Google Tasks, Microsoft To Do or iCalendar VTODO. Task deadlines do not stretch the timeline or count as occupied time. Explicitly non-busy events (`busy: false`, Google transparent events or iCalendar `TRANSP:TRANSPARENT`) do not bound free gaps.

The timeline uses the complete loaded day to establish its range and gaps even if `maxEvents` hides entries. Very short appointments retain a readable minimum height; overlapping visual blocks use lanes, and events that cannot fit in those lanes are counted in `+ more`. Location/time details are omitted from short blocks before titles are clipped. Full event time/title remain in accessible markup. The next-event panel prefers the next future appointment, then an ongoing appointment if no future one exists. Due entries are plain text rather than inactive checkboxes; ongoing appointments use only a colored rail, without an enclosing outline. Text line boxes reserve space for descenders before overflow fitting.

Existing personal heading, icon, image, font-size and information-density settings continue to apply. Choosing this view is optional and does not change the default calendar view.

## Composed layouts

`bootLayoutIntegration(target)` renders a host-resolved `payload.layout`. The first-party
Layout editor stores two to four paper references; only the authenticated host resolves
them to image URLs or integration render URLs and per-content INIT payloads. Never pass
organization-wide credentials to children or persist signed image URLs in settings.

A layout contains `renderId`, `layout` (`columns`, `rows`, `grid`, `custom`), `regions`,
`ratio`, `gap`, `color`, and optionally `html`/`css`. Each region has a unique `id`, `type`
(`image` or `integration`), `url`, optional `payload`, image `fit`/`focalX`/`focalY`, and
`processing` (`inherit`, `photo`, `readable`, `quantization`). Custom HTML uses one
`<paperless-slot name="region-id"></paperless-slot>` per region. Its presentation-only
markup and resource-free CSS are validated and isolated in a shadow root. Slots must be
rectangular, opaque, untransformed, non-overlapping and within the fixed viewport.

Embedded child documents use a `paperless-slot:` window name containing `renderId`,
`regionId` and `parentOrigin`. `waitForPayload()` registers its receiver and sends
`PAPERLESS_RENDER_HELLO`; it disables the standalone fallback and accepts only the matching
INIT from the named parent origin/window. The parent sends INIT once per fresh child
iframe. `markLoading`, `markReady`, and `markError` report `PAPERLESS_RENDER_STATUS` with
the same identifiers. Error is a distinct terminal result, never an intermediate READY.
`waitForPayload({ source: window.parent })` also restricts top-level layout initialization.

The layout waits for image decoding, every child, fonts and layout settling. Each preview
update aborts the previous run and creates new iframes, so old asynchronous work cannot
complete a newer run. A failed/missing child fails the whole frame after at most 12 seconds;
applications should keep the previous display image. Integrations without a readiness
contract or which block framing cannot be embedded. Live previews need the updated runtime;
headless renderers additionally bridge the older DOM marker contract.

On success the layout writes `meta[name="paperless:regions"]` with integer pixel bounds
and processing settings. Renderers validate bounds/count/overlap, process the background
without the content areas, independently process each raw crop using one target palette,
and compose device-color pixels without further resampling or dithering. Panel rotation
happens once after composition in the host API. `enabled:false` is accepted only for areas
already containing opaque device-palette pixels. CLI/preview rendering uses the same region
contract. `renderRegions.ts` and `renderEmbedded.ts` have matching host API counterparts;
keep their protocol and validation behavior aligned.

Browser regression checks (requires Chrome) and optional review images:

```sh
LAYOUT_BROWSER_TESTS=1 LAYOUT_REVIEW_DIR=/tmp/layout-review npm test -- --run test/layout-render.test.ts
```

These use local synthetic data only and cover both frame sizes/orientations, a custom
HTML layout, cross-origin loading, child errors and overlapping regions.

## npm releases

The source repository builds the complete runtime, including calendar, settings,
and Layout helpers. Run `npm test` and `npm run typecheck`, then `npm pack` to
produce the public `@paperlesspaper/openintegration` package. Validate this tarball
in the provider, including `LAYOUT_BROWSER_TESTS=1 LAYOUT_PROVIDER_DIR=/path/to/provider`
browser tests, before publishing. Consumers pin an exact npm version; no separate
Layout addon or vendor snapshot is required.
