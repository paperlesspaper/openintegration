# @paperlesspaper/openintegration

Tiny helper toolkit and local CLI for static paperlesspaper OpenIntegration pages.

This package is intentionally boring: no React, no generated app lifecycle, and no `createRenderApp()`. Your integration stays a small website with a `config.json`, a `render.html`, and optionally an API route. The CLI provides the pieces needed to scaffold, validate, preview, and render those files locally.

## Install

```sh
npm install @paperlesspaper/openintegration
```

For no-build integrations, copy these files from `dist/` into your integration folder:

```txt
paperless.css
paperless.js
paperless.iife.js
```

## Dev preview

Create a starter integration:

```sh
paperlesspaper-openintegration scaffold ./my-integration --name "My Integration"
```

Use `--no-api` for a static-only starter. By default the scaffold includes `api/data.js`, because most integrations need a small data adapter between external APIs and the render page.

Run a local paperlesspaper host simulator for an integration:

```sh
paperlesspaper-openintegration dev ./config.json
```

During package development, you can run it from this repository:

```sh
npm run dev -- ../paperlesspaper-integrations/openintegrations/applications/quote/config.json
```

The preview serves the integration folder, validates `config.json`, opens a host page at `http://127.0.0.1:4300/__paperless/preview`, sends an `INIT` payload to the render iframe, generates sidebar inputs from `formSchema`, embeds `settingsPage` when configured, lets you edit raw `meta.pluginSettings`, caches preview values in `localStorage` with a reset button, and watches for `#website-has-loaded`.

The renderer panel can show either the raw Chrome/Puppeteer screenshot or the production-like `epdoptimize` output. Current sidebar settings and color are passed to the render page through the `INIT` payload; color is also mirrored into `meta.pluginSettings.color` automatically. Both render outputs replace the iframe in the main device preview, and Download saves the currently shown PNG.

It also watches the integration folder and live-reloads the preview when files change. Disable that with:

```sh
paperlesspaper-openintegration dev ./config.json --no-watch
```

Validate an integration without opening the browser:

```sh
paperlesspaper-openintegration check ./config.json
```

Use `--json` for machine-readable check output in CI.

Render an integration through local Chrome/Puppeteer and `epdoptimize`:

```sh
paperlesspaper-openintegration render ./config.json --viewport 800x480 --output render.png
```

Use `--raw` to write the unoptimized Puppeteer screenshot. The interactive preview includes separate Puppeteer and EPD buttons that call the same local render endpoint, plus a Live button to switch the main preview back to the iframe.

The recommended generation loop is:

```sh
paperlesspaper-openintegration scaffold ./applications/example --name "Example"
paperlesspaper-openintegration check ./applications/example/config.json
paperlesspaper-openintegration render ./applications/example/config.json --viewport 800x480 --output /tmp/example-landscape.png
paperlesspaper-openintegration render ./applications/example/config.json --viewport 480x800 --output /tmp/example-portrait.png
paperlesspaper-openintegration dev ./applications/example/config.json
```

## LLM integration contract

When generating a new integration, create a small folder with this shape:

```txt
my-integration/
  config.json
  render.html
  api/data.js      # optional, but recommended for API/data normalization
  README.md        # optional
  assets/...       # optional static images or icons
```

Rules that keep generated integrations compatible:

- `config.json` must include `name`, `version`, and `renderPage`.
- Prefer `renderPage: "./render.html"` and relative asset/API paths.
- Put every user-editable setting in both `nativeSettings` and `formSchema.properties`.
- Put global defaults such as `color` in `nativeSettings`, but do not add `color` to `formSchema.properties`; the host and CLI preview provide the global color control.
- If a setting is edited by a custom `settingsPage`, add `"inStettingsPage": true` to that `formSchema.properties.<name>` entry so the CLI preview does not also show it in the generated form.
- Use `""` for empty string settings instead of `null` when the setting is a text filter.
- Keep API handlers as default-exported async functions in `api/*.js`. The dev server calls them with `{ query }` and serves the returned value as JSON.
- In `render.html`, wait for `INIT` with `waitForPayload()`, merge defaults with `getSettings(payload)` and `getQuerySettings()`, render DOM, wait for fonts/images if needed, fit content, then call `markReady()`.
- Wrap the render logic in `try/catch` and call `markError(error)` on failure.
- Escape untrusted strings with `escapeHtml()` before injecting HTML.
- Add `<div id="website-has-loading-element"></div>` at startup. `markReady()` removes it and adds `#website-has-loaded`.
- Treat `color` as a global setting: include it in config and render defaults, merge it with `getSettings(payload)` and `getQuerySettings()`, then apply the resolved value with `applyColorTheme()` so host defaults and preview/query overrides all work.
- Design for fixed color eInk frames. paperlesspaper displays support the six Spectra 6 colors, so do not assume monochrome-only rendering.
- Prefer high-contrast layouts, intentional color accents, real CSS media queries for orientation, and deterministic data limits so text cannot grow without bound.

Minimal render flow for generated pages:

```js
const payload = await waitForPayload({ timeoutMs: 500 });
const defaults = {
  // Add integration-specific defaults here too.
  color: "light"
};
const settings = mergeSettings(defaults, getSettings(payload), getQuerySettings());
applyColorTheme(settings.color, { defaultTheme: defaults.color });

// Fetch/prepare data, update the DOM, then:
await document.fonts?.ready;
fitAllText();
fitToScreen(document.querySelector("#app"));
markReady();
```

## Minimal config.json

```json
{
  "name": "daily-xkcd",
  "version": "1.0.0",
  "description": "Show an XKCD comic on a paperlesspaper display.",
  "renderPage": "render.html",
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

## Static render.html

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
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
        applyColorTheme,
        markReady,
        markError,
        fitAllText,
        fitToScreen,
        escapeHtml
      } from "./paperless.js";

      const app = document.querySelector("#app");

      try {
        const payload = await waitForPayload({ timeoutMs: 500 });
        const defaults = { color: "light", kind: "latest", difference: 0 };
        const settings = mergeSettings(
          defaults,
          getSettings(payload),
          getQuerySettings()
        );
        applyColorTheme(settings.color, { defaultTheme: defaults.color });

        const url = new URL("./api/data", window.location.href);
        url.searchParams.set("kind", settings.kind);
        url.searchParams.set("difference", settings.difference);

        const response = await fetch(url);
        const comic = await response.json();

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

          <footer class="pp-footer">${escapeHtml(comic.alt)}</footer>
        `;

        await document.fonts?.ready;
        fitAllText();
        fitToScreen(app);
        markReady();
      } catch (error) {
        markError(error);
      }
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
- `waitForPayload({ timeoutMs?, fallback?, allowedOrigins? })`
- `getSettings(payload?, defaults?)`
- `getQuerySettings(defaults?)`
- `mergeSettings(...sources)`
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
- `validateConfig(config)`

## Color themes

`paperless.css` exposes app-style theme class names using only the six full Spectra 6 device colors internally:

```txt
dark, light, red-dark, red-light, blue-dark, blue-light, green-dark, green-light
```

Generated render pages should treat `color` as a global setting with a local default, merge it from the host payload and query string, then call `applyColorTheme(settings.color, { defaultTheme: defaults.color })`. For query-only static pages, `applyColorThemeFromQuery()` is a shortcut that reads `?color=` and applies the theme to `document.body`. The CSS exposes both the openintegration variables (`--pp-bg`, `--pp-fg`, `--pp-muted`, `--pp-border`, `--pp-card`, `--pp-accent`) and the app-style aliases (`--background`, `--foreground`, `--muted`, `--card-border`, `--accent`).

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
