import type { JsonRecord, OpenIntegrationConfig } from "./types";
import { escapeHtml } from "./html";

export interface PreviewHtmlOptions {
  config: OpenIntegrationConfig;
  configUrl: string;
  payload: JsonRecord;
  renderPath: string;
  settingsPath?: string;
}

function serializeForScript(value: unknown): string {
  return JSON.stringify(value ?? null).replace(/</g, "\\u003c");
}

const defaultPreviewFavicon = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#101315"/><path d="M8 10l6 6-6 6" fill="none" stroke="#f5f7f8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 23h8" fill="none" stroke="#f5f7f8" stroke-width="3" stroke-linecap="round"/></svg>'
)}`;

const icons: Record<string, string> = {
  cpu: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>',
  eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
  fileJson: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1"/><path d="M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1"/></svg>',
  form: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>',
  image: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>',
  monitor: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>',
  pulse: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 12h-4l-3 8L9 4l-3 8H2"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 0 1-15.54 6.22L3 16"/><path d="M3 21v-5h5"/><path d="M3 12A9 9 0 0 1 18.54 5.78L21 8"/><path d="M21 3v5h-5"/></svg>',
  reset: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
  send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>',
  settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21v-7"/><path d="M4 10V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M20 21v-5"/><path d="M20 12V3"/><path d="M2 14h4"/><path d="M10 8h4"/><path d="M18 16h4"/></svg>',
  terminal: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 17 6-6-6-6"/><path d="M12 19h8"/></svg>'
};

function icon(name: keyof typeof icons): string {
  return icons[name];
}

function toPreviewAssetPath(value: string): string {
  if (/^https?:\/\//.test(value)) {
    return value;
  }

  return `/${value.replace(/^\.?\//, "")}`;
}

export function createPreviewHtml({
  config,
  configUrl,
  payload,
  renderPath,
  settingsPath,
}: PreviewHtmlOptions): string {
  const configJson = serializeForScript(config);
  const payloadJson = serializeForScript(payload);
  const renderPathJson = serializeForScript(renderPath);
  const settingsPathJson = serializeForScript(settingsPath);
  const title = escapeHtml(config.name);
  const version = escapeHtml(config.version);
  const renderPage = escapeHtml(config.renderPage);
  const settingsPage = config.settingsPage
    ? escapeHtml(config.settingsPage)
    : "";
  const settingsHref = settingsPath ? escapeHtml(settingsPath) : settingsPage;
  const escapedConfigUrl = escapeHtml(configUrl);
  const iconPath = typeof config.icon === "string" && config.icon.trim()
    ? toPreviewAssetPath(config.icon)
    : undefined;
  const topbarTitleClass = iconPath ? "topbar-title" : "topbar-title no-icon";
  const faviconPath = iconPath ?? defaultPreviewFavicon;
  const iconHtml = iconPath
    ? `<img class="integration-icon" src="${escapeHtml(iconPath)}" alt="" aria-hidden="true">`
    : "";
  const languageCodes = Array.isArray(config.language)
    ? config.language.filter((language): language is string => typeof language === "string" && language.trim() !== "")
    : [];
  const languageFieldHtml = languageCodes.length > 0
    ? `<label class="field">
              <span class="field-title">Language</span>
              <select id="language">
                ${languageCodes
                  .map((language) => `<option value="${escapeHtml(language)}">${escapeHtml(language)}</option>`)
                  .join("\n                ")}
              </select>
            </label>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${title} - paperlesspaper preview</title>
    <link rel="icon" href="${escapeHtml(faviconPath)}" />
    <style>
      :root {
        color-scheme: light dark;
        --bg: #0b0d0e;
        --fg: #f5f7f8;
        --muted: #9aa4a9;
        --line: #273033;
        --panel: #14181a;
        --panel-2: #101315;
        --field: #090b0c;
        --accent: #f5f7f8;
        --accent-fg: #090b0c;
        --danger: #d4d8da;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        background: var(--bg);
        color: var(--fg);
        height: 100vh;
        overflow: hidden;
      }

      .app {
        height: 100vh;
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
      }

      .topbar {
        background: var(--panel);
        border-bottom: 1px solid var(--line);
        display: grid;
        grid-template-columns: minmax(220px, 1fr) auto auto;
        align-items: center;
        gap: 14px;
        padding: 10px 14px;
        min-width: 0;
      }

      .topbar-title {
        min-width: 0;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        column-gap: 12px;
        row-gap: 2px;
        align-items: center;
      }

      .topbar-title.no-icon {
        grid-template-columns: minmax(0, 1fr);
      }

      .topbar-kicker {
        color: var(--accent);
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        font-weight: 750;
        letter-spacing: 0;
        text-transform: uppercase;
      }

      .title-copy {
        min-width: 0;
        display: grid;
        gap: 2px;
      }

      .integration-icon {
        width: 42px;
        height: 42px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: #FFFFFF;
        object-fit: contain;
        padding: 5px;
      }

      .topbar-meta {
        color: var(--muted);
        font-size: 12px;
        line-height: 1.3;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .topbar-controls,
      .topbar-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }

      .topbar-actions {
        justify-content: flex-end;
      }

      .workspace {
        min-height: 0;
        display: grid;
        grid-template-columns: minmax(300px, 360px) minmax(0, 1fr);
      }

      .sidebar {
        min-height: 0;
        overflow-y: auto;
        overscroll-behavior: contain;
        scrollbar-color: var(--line) transparent;
        border-right: 1px solid var(--line);
        background: var(--panel);
        padding: 14px;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }

      main {
        min-width: 0;
        min-height: 0;
        display: grid;
        place-items: center;
        padding: 24px;
        overflow: hidden;
      }

      h1 {
        font-size: 17px;
        line-height: 1.25;
        margin: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .meta {
        color: var(--muted);
        font-size: 13px;
        line-height: 1.4;
        overflow-wrap: anywhere;
      }

      label {
        display: grid;
        gap: 6px;
        color: var(--muted);
        font-size: 12px;
        font-weight: 650;
        text-transform: uppercase;
      }

      .topbar label {
        min-width: 150px;
      }

      .viewport-control {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
      }

      .viewport-presets {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .topbar .viewport-preset {
        width: 34px;
        padding: 0;
      }

      .viewport-preset[aria-pressed="true"] {
        background: var(--accent);
        border-color: var(--accent);
        color: var(--accent-fg);
      }

      .viewport-symbol {
        border: 2px solid currentColor;
        border-radius: 3px;
        display: grid;
        place-items: center;
        font-size: 10px;
        font-weight: 800;
        line-height: 1;
      }

      .viewport-symbol.portrait {
        width: 13px;
        height: 22px;
      }

      .viewport-symbol.landscape {
        width: 22px;
        height: 13px;
      }

      .viewport-control select {
        width: 190px;
      }

      select,
      input,
      textarea,
      button {
        width: 100%;
        border: 1px solid var(--line);
        border-radius: 6px;
        font: inherit;
      }

      select,
      input,
      textarea {
        background: var(--field);
        color: var(--fg);
      }

      select,
      input {
        height: 38px;
        padding: 0 10px;
      }

      .topbar select,
      .topbar input {
        height: 34px;
      }

      input[type="checkbox"] {
        width: 18px;
        height: 18px;
        accent-color: var(--accent);
      }

      textarea {
        min-height: 160px;
        resize: vertical;
        padding: 10px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        font-size: 12px;
        line-height: 1.45;
      }

      .actions {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
      }

      button {
        height: 38px;
        cursor: pointer;
        background: var(--panel-2);
        color: var(--fg);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        font-weight: 650;
        white-space: nowrap;
      }

      .topbar button {
        width: auto;
        height: 34px;
        padding: 0 11px;
      }

      .button-icon {
        width: 16px;
        height: 16px;
        display: inline-flex;
        flex: 0 0 auto;
      }

      .button-icon svg {
        width: 16px;
        height: 16px;
        fill: none;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      button.primary {
        background: var(--accent);
        border-color: var(--accent);
        color: var(--accent-fg);
      }

      button:disabled {
        cursor: not-allowed;
        opacity: 0.45;
      }

      .status {
        border: 1px solid var(--line);
        border-radius: 6px;
        padding: 10px;
        font-size: 13px;
        line-height: 1.4;
        background: var(--panel-2);
      }

      .status strong {
        display: block;
        margin-bottom: 2px;
      }

      .frame-wrap {
        display: grid;
        place-items: center;
        width: 100%;
        height: 100%;
        max-width: 100%;
        overflow: auto;
      }

      .device {
        background: #000000;
        border: 1px solid var(--line);
        box-shadow: 0 18px 60px rgb(0 0 0 / 0.18);
        position: relative;
        width: var(--preview-width);
        height: var(--preview-height);
      }

      iframe,
      .rendered-preview {
        display: block;
        width: 100%;
        height: 100%;
        border: 0;
        background: #FFFFFF;
      }

      .rendered-preview {
        object-fit: contain;
      }

      iframe[hidden],
      .rendered-preview[hidden] {
        display: none;
      }

      .settings-form {
        display: grid;
        gap: 10px;
      }

      .field {
        display: grid;
        gap: 6px;
      }

      .field-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        color: var(--muted);
        font-size: 12px;
        font-weight: 650;
        text-transform: uppercase;
      }

      .field-title {
        color: var(--muted);
        font-size: 12px;
        font-weight: 650;
        line-height: 1.25;
        text-transform: uppercase;
      }

      .field-help {
        margin: 0;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.35;
      }

      details {
        border: 1px solid var(--line);
        border-radius: 6px;
        background: var(--panel-2);
      }

      summary {
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 7px;
        list-style: none;
        padding: 10px;
        color: var(--muted);
        font-size: 12px;
        font-weight: 650;
        text-transform: uppercase;
      }

      summary::-webkit-details-marker {
        display: none;
      }

      summary::before {
        content: "";
        width: 0;
        height: 0;
        border-top: 4px solid transparent;
        border-bottom: 4px solid transparent;
        border-left: 5px solid currentColor;
        transform-origin: 50% 50%;
      }

      details[open] > summary::before {
        transform: rotate(90deg);
      }

      summary .button-icon {
        color: var(--accent);
      }

      details > .details-body {
        display: grid;
        gap: 10px;
        padding: 0 10px 10px;
      }

      a {
        color: var(--accent);
      }

      .settings-page-frame {
        width: 100%;
        height: 220px;
        border: 1px solid var(--line);
        border-radius: 6px;
        background: #FFFFFF;
      }

      .renderer-preview {
        display: grid;
        gap: 10px;
      }

      .renderer-preview .actions {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .manifest-preview {
        display: grid;
        gap: 10px;
      }

      .variants-header {
        display: grid;
        gap: 8px;
      }

      .variants-header .actions {
        grid-template-columns: 1fr;
      }

      .variants-list {
        display: grid;
        gap: 10px;
      }

      .variant-card {
        border: 1px solid var(--line);
        border-radius: 6px;
        overflow: hidden;
        background: var(--field);
      }

      .variant-card-header {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 8px;
        align-items: center;
        padding: 8px;
      }

      .variant-card-header button {
        width: auto;
        padding: 0 10px;
      }

      .variant-title {
        color: var(--fg);
        font-size: 12px;
        font-weight: 750;
        line-height: 1.25;
        overflow-wrap: anywhere;
      }

      .variant-settings {
        margin: 0;
        padding: 0 8px 8px;
        color: var(--muted);
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        font-size: 11px;
        line-height: 1.35;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }

      .variant-screenshots {
        display: grid;
        gap: 8px;
        padding: 0 8px 8px;
      }

      .variant-screenshot {
        display: grid;
        gap: 5px;
        margin: 0;
      }

      .variant-screenshot img {
        width: 100%;
        aspect-ratio: 5 / 3;
        border: 1px solid var(--line);
        border-radius: 4px;
        background: #FFFFFF;
        object-fit: contain;
      }

      .variant-screenshot figcaption {
        color: var(--muted);
        font-size: 11px;
        line-height: 1.3;
        overflow-wrap: anywhere;
      }

      .sidebar-footer {
        margin-top: auto;
        padding-top: 2px;
      }

      @media (max-width: 820px) {
        body {
          height: auto;
          overflow: auto;
        }

        .app {
          height: auto;
          min-height: 100vh;
        }

        .topbar {
          grid-template-columns: 1fr;
          align-items: stretch;
        }

        .topbar-controls,
        .topbar-actions {
          flex-wrap: wrap;
        }

        .topbar-actions {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .topbar-actions button {
          width: 100%;
        }

        .topbar label {
          min-width: min(180px, 100%);
          flex: 1 1 180px;
        }

        .workspace {
          grid-template-columns: 1fr;
        }

        .sidebar {
          max-height: 52vh;
          border-right: 0;
          border-bottom: 1px solid var(--line);
        }

        main {
          padding: 14px;
          min-height: 48vh;
        }
      }
    </style>
  </head>
  <body>
    <div class="app">
      <header class="topbar">
        <div class="${topbarTitleClass}">
          ${iconHtml}
          <div class="title-copy">
            <div class="topbar-kicker"><span class="button-icon">${icon("terminal")}</span>OpenIntegration preview</div>
            <h1>${title}</h1>
            <div class="topbar-meta">v${version} · ${renderPage}</div>
          </div>
        </div>

        <div class="topbar-controls">
          <div class="viewport-control">
            <div class="viewport-presets" aria-label="Viewport presets">
              <button type="button" class="viewport-preset" data-viewport="480x800" title="480 x 800 portrait" aria-label="480 x 800 portrait"><span class="viewport-symbol portrait">7</span></button>
              <button type="button" class="viewport-preset" data-viewport="800x480" title="800 x 480 landscape" aria-label="800 x 480 landscape"><span class="viewport-symbol landscape">7</span></button>
              <button type="button" class="viewport-preset" data-viewport="1200x1600" title="1200 x 1600 portrait" aria-label="1200 x 1600 portrait"><span class="viewport-symbol portrait">L</span></button>
              <button type="button" class="viewport-preset" data-viewport="1600x1200" title="1600 x 1200 landscape" aria-label="1600 x 1200 landscape"><span class="viewport-symbol landscape">L</span></button>
            </div>
            <select id="viewport" aria-label="Viewport">
              <option value="800x480">800 x 480 landscape</option>
              <option value="480x800">480 x 800 portrait</option>
              <option value="1600x1200">1600 x 1200 landscape</option>
              <option value="1200x1600">1200 x 1600 portrait</option>
              <option value="1024x758">1024 x 758 landscape</option>
              <option value="758x1024">758 x 1024 portrait</option>
              <option value="1200x825">1200 x 825 landscape</option>
              <option value="825x1200">825 x 1200 portrait</option>
            </select>
          </div>
        </div>

        <div class="topbar-actions">
          <button class="primary" id="send" title="Send INIT"><span class="button-icon">${icon("send")}</span><span>Send INIT</span></button>
          <button id="reload" title="Reload preview"><span class="button-icon">${icon("refresh")}</span><span>Reload</span></button>
          <button id="reset" title="Reset saved preview values"><span class="button-icon">${icon("reset")}</span><span>Reset</span></button>
        </div>
      </header>

      <div class="workspace">
        <aside class="sidebar">
        ${
          settingsPage
            ? `<details open>
          <summary><span class="button-icon">${icon("settings")}</span><span>Settings Page</span></summary>
          <div class="details-body">
            <a href="${settingsHref}" target="_blank" rel="noreferrer">${settingsPage}</a>
            <iframe class="settings-page-frame" id="settings-page" title="${title} settings preview"></iframe>
          </div>
        </details>`
            : ""
        }

        <details open>
          <summary><span class="button-icon">${icon("form")}</span><span>Form Settings</span></summary>
          <div class="details-body">
            <label class="field">
              <span class="field-title">Color</span>
              <select id="color">
                <option value="">none</option>
                <option value="dark">dark</option>
                <option value="light">light</option>
                <option value="red-dark">red-dark</option>
                <option value="red-light">red-light</option>
                <option value="blue-dark">blue-dark</option>
                <option value="blue-light">blue-light</option>
                <option value="green-dark">green-dark</option>
                <option value="green-light">green-light</option>
              </select>
            </label>
            ${languageFieldHtml}
            <div class="settings-form" id="form-fields"></div>
          </div>
        </details>

        <details>
          <summary><span class="button-icon">${icon("fileJson")}</span><span>pluginSettings JSON</span></summary>
          <div class="details-body">
            <textarea id="settings" spellcheck="false"></textarea>
          </div>
        </details>

        <div class="status" id="status">
          <strong>Booting</strong>
          Waiting for the iframe.
        </div>

        <details open>
          <summary><span class="button-icon">${icon("pulse")}</span><span>Diagnostics</span></summary>
          <div class="details-body">
            <div class="status" id="dev-status">
              <strong>Dev server</strong>
              Connecting to file watcher.
            </div>
            <div class="status" id="render-status">
              <strong>Render</strong>
              Not rendered yet.
            </div>
            <div class="status" id="schema-status">
              <strong>Settings schema</strong>
              Waiting for manifest.
            </div>
          </div>
        </details>

        <details open>
          <summary><span class="button-icon">${icon("image")}</span><span>Config Variants</span></summary>
          <div class="details-body manifest-preview">
            <div class="variants-header">
              <div class="status" id="variants-status">
                <strong>Variants</strong>
                Waiting for manifest.
              </div>
              <div class="actions">
                <button id="regenerate-variants" title="Regenerate configured screenshots"><span class="button-icon">${icon("refresh")}</span><span>Regenerate</span></button>
              </div>
            </div>
            <div class="variants-list" id="variants-list"></div>
          </div>
        </details>

        <details open>
          <summary><span class="button-icon">${icon("monitor")}</span><span>Renderer</span></summary>
          <div class="details-body renderer-preview">
            <div class="actions">
              <button id="puppeteer-render" title="Show raw Puppeteer output"><span class="button-icon">${icon("monitor")}</span><span>Puppeteer</span></button>
              <button class="primary" id="epd-render" title="Show epdoptimize output"><span class="button-icon">${icon("cpu")}</span><span>EPD</span></button>
              <button id="show-live" title="Show live iframe preview"><span class="button-icon">${icon("eye")}</span><span>Live</span></button>
              <button id="renderer-download" disabled title="Download current render"><span class="button-icon">${icon("download")}</span><span>Download</span></button>
            </div>
            <div class="status" id="renderer-status">
              <strong>Renderer</strong>
              Not rendered yet.
            </div>
          </div>
        </details>

        <div class="meta sidebar-footer">Config: ${escapedConfigUrl}</div>
      </aside>

      <main>
        <div class="frame-wrap">
          <div class="device">
            <iframe id="preview" title="${title} render preview"></iframe>
            <img class="rendered-preview" id="rendered-preview" alt="${title} render output preview" hidden>
          </div>
        </div>
      </main>
      </div>
    </div>

    <script>
      const config = ${configJson};
      const basePayload = ${payloadJson};
      const renderPath = ${renderPathJson};
      const settingsPath = ${settingsPathJson};
      const iframe = document.querySelector("#preview");
      const renderedPreview = document.querySelector("#rendered-preview");
      const settingsFrame = document.querySelector("#settings-page");
      const formFields = document.querySelector("#form-fields");
      const settings = document.querySelector("#settings");
      const status = document.querySelector("#status");
      const devStatus = document.querySelector("#dev-status");
      const renderStatus = document.querySelector("#render-status");
      const schemaStatus = document.querySelector("#schema-status");
      const rendererStatus = document.querySelector("#renderer-status");
      const rendererDownload = document.querySelector("#renderer-download");
      const variantsStatus = document.querySelector("#variants-status");
      const variantsList = document.querySelector("#variants-list");
      const regenerateVariants = document.querySelector("#regenerate-variants");
      const viewport = document.querySelector("#viewport");
      const viewportPresets = [...document.querySelectorAll("[data-viewport]")];
      const color = document.querySelector("#color");
      const language = document.querySelector("#language");
      const colorThemes = [
        "black",
        "white",
        "blue",
        "green",
        "red",
        "yellow",
        "dark",
        "light",
        "red-dark",
        "red-light",
        "blue-dark",
        "blue-light",
        "green-dark",
        "green-light"
      ];
      let monitorTimer;
      let timeoutTimer;
      let reloadTimer;
      let syncingJson = false;
      let cacheSuppressed = false;
      let deviceObjectUrl;
      let rendererDownloadName;

      const defaultPluginSettings = basePayload.meta.pluginSettings || {};
      const defaultSettingsValue = JSON.stringify(defaultPluginSettings, null, 2);
      const defaultColorValue =
        typeof defaultPluginSettings.color === "string" ? defaultPluginSettings.color : basePayload.meta.color || "";
      const defaultLanguageValue = typeof basePayload.meta.language === "string" ? basePayload.meta.language : "";
      const defaultViewportValue = viewport.value;
      const storageKey = [
        "paperlesspaper-openintegration",
        config.name,
        config.version,
        renderPath
      ].join(":");

      settings.value = defaultSettingsValue;
      selectValue(color, defaultColorValue, "");
      if (language) {
        selectValue(language, defaultLanguageValue, language.options[0]?.value || "");
      }
      syncSettingsColorFromSelect();

      function isObject(value) {
        return Boolean(value) && typeof value === "object" && !Array.isArray(value);
      }

      function setStatus(title, detail) {
        status.innerHTML = "<strong>" + title + "</strong>" + detail;
      }

      function setPanel(panel, title, detail) {
        panel.innerHTML = "<strong>" + title + "</strong>" + detail;
      }

      function escapeText(value) {
        return String(value).replace(/[&<>"']/g, (char) => {
          switch (char) {
            case "&":
              return "&amp;";
            case "<":
              return "&lt;";
            case ">":
              return "&gt;";
            case '"':
              return "&quot;";
            default:
              return "&#039;";
          }
        });
      }

      function assetUrl(value, cacheBust) {
        if (typeof value !== "string" || !value.trim()) {
          return "";
        }

        const url = /^https?:\\/\\//.test(value)
          ? new URL(value)
          : new URL(value.replace(/^\\.?\\//, "/"), window.location.href);

        if (cacheBust) {
          url.searchParams.set("t", String(cacheBust));
        }

        return url.href;
      }

      function settingsFromVariant(variant) {
        if (!isObject(variant)) {
          return {};
        }

        const values = {};

        for (const [key, value] of Object.entries(variant)) {
          if (key !== "screenshots") {
            values[key] = value;
          }
        }

        return values;
      }

      function variantTitle(index, variant) {
        const values = settingsFromVariant(variant);
        const parts = Object.entries(values)
          .filter(([, value]) => typeof value === "string" || typeof value === "number" || typeof value === "boolean")
          .slice(0, 3)
          .map(([key, value]) => key + "=" + String(value));

        return "Variant " + (index + 1) + (parts.length ? " · " + parts.join(" · ") : "");
      }

      function variantSettingsSummary(variant) {
        const values = settingsFromVariant(variant);
        const text = JSON.stringify(values, null, 2);

        if (text.length <= 360) {
          return text;
        }

        return text.slice(0, 357) + "...";
      }

      function selectValue(select, value, fallback) {
        if ([...select.options].some((option) => option.value === value)) {
          select.value = value;
          return;
        }

        select.value = fallback;
      }

      function syncViewportPresets() {
        viewportPresets.forEach((button) => {
          button.setAttribute("aria-pressed", button.dataset.viewport === viewport.value ? "true" : "false");
        });
      }

      function parseEditablePluginSettings() {
        try {
          const values = JSON.parse(settings.value || "{}");
          return isObject(values) ? values : {};
        } catch {
          return {};
        }
      }

      function syncSettingsColorFromSelect() {
        const values = parseEditablePluginSettings();

        if (color.value) {
          values.color = color.value;
        } else {
          delete values.color;
        }

        syncingJson = true;
        settings.value = JSON.stringify(values, null, 2);
        syncingJson = false;
      }

      function syncColorFromJson() {
        try {
          const values = JSON.parse(settings.value || "{}");

          if (!isObject(values)) {
            return;
          }

          selectValue(color, typeof values.color === "string" ? values.color : "", "");
        } catch {
          // Keep the current select value while the raw JSON is being edited.
        }
      }

      function updatePluginSettings(nextSettings, reason) {
        if (!isObject(nextSettings)) {
          return;
        }

        const values = {
          ...parseEditablePluginSettings(),
          ...nextSettings
        };

        if (color.value) {
          values.color = color.value;
        } else if (Object.prototype.hasOwnProperty.call(nextSettings, "color")) {
          delete values.color;
        }

        syncingJson = true;
        settings.value = JSON.stringify(values, null, 2);
        syncingJson = false;
        syncFormFromJson();
        syncColorFromJson();
        cacheState(reason);
        scheduleReload(reason);
        sendSettingsPageInit();
      }

      function readCachedState() {
        try {
          const raw = localStorage.getItem(storageKey);
          const state = raw ? JSON.parse(raw) : undefined;
          return isObject(state) ? state : {};
        } catch {
          return {};
        }
      }

      function cacheState(reason) {
        if (cacheSuppressed) {
          return;
        }

        try {
          localStorage.setItem(
            storageKey,
            JSON.stringify({
              color: color.value,
              language: language?.value,
              settings: settings.value,
              viewport: viewport.value
            })
          );
          setPanel(devStatus, "Cached", reason);
        } catch (error) {
          setPanel(devStatus, "Cache unavailable", String(error.message || error));
        }
      }

      function hydrateCachedState() {
        const state = readCachedState();

        if (typeof state.settings === "string") {
          settings.value = state.settings;
        }

        if (typeof state.color === "string") {
          selectValue(color, state.color, defaultColorValue);
        } else {
          syncColorFromJson();
        }

        if (language) {
          if (typeof state.language === "string") {
            selectValue(language, state.language, defaultLanguageValue);
          } else {
            selectValue(language, defaultLanguageValue, language.options[0]?.value || "");
          }
        }

        if (typeof state.viewport === "string") {
          selectValue(viewport, state.viewport, defaultViewportValue);
        }

        syncViewportPresets();

        syncSettingsColorFromSelect();

        if (Object.keys(state).length > 0) {
          setPanel(devStatus, "Cache restored", "Loaded saved preview values.");
        }
      }

      function resetCachedState() {
        try {
          localStorage.removeItem(storageKey);
        } catch {
          // localStorage may be unavailable in restricted browser modes.
        }

        settings.value = defaultSettingsValue;
        selectValue(color, defaultColorValue, "");
        if (language) {
          selectValue(language, defaultLanguageValue, language.options[0]?.value || "");
        }
        selectValue(viewport, defaultViewportValue, defaultViewportValue);
        cacheSuppressed = true;
        syncSettingsColorFromSelect();
        syncFormFromJson();
        applyViewport();
        syncViewportPresets();
        setPanel(devStatus, "Cache reset", "Restored manifest defaults.");
        reloadFrame();
        cacheSuppressed = false;
      }

      function currentPayload() {
        let pluginSettings;
        try {
          pluginSettings = JSON.parse(settings.value || "{}");
        } catch (error) {
          throw new Error("pluginSettings is not valid JSON: " + error.message);
        }

        if (color.value) {
          pluginSettings = {
            ...pluginSettings,
            color: color.value
          };
        }

        return {
          ...basePayload,
          meta: {
            ...basePayload.meta,
            color: color.value || undefined,
            language: language?.value || basePayload.meta.language,
            pluginSettings
          }
        };
      }

      function sendSettingsPageInit() {
        if (!settingsFrame?.contentWindow) {
          return;
        }

        try {
          settingsFrame.contentWindow.postMessage(
            {
              type: "INIT",
              cmd: "message",
              data: currentPayload()
            },
            window.location.origin
          );
        } catch {
          // The settings frame may still be navigating.
        }
      }

      function revokeDeviceObjectUrl() {
        if (deviceObjectUrl) {
          URL.revokeObjectURL(deviceObjectUrl);
          deviceObjectUrl = undefined;
        }
      }

      function showLivePreview() {
        renderedPreview.hidden = true;
        renderedPreview.removeAttribute("src");
        iframe.hidden = false;
        rendererDownload.disabled = true;
        rendererDownloadName = undefined;
        revokeDeviceObjectUrl();
      }

      function showRenderedPreview(objectUrl) {
        renderedPreview.src = objectUrl;
        renderedPreview.hidden = false;
        iframe.hidden = true;
      }

      function downloadName(suffix) {
        const name = (config.name || "openintegration").toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const slug = name.replace(/^-|-$/g, "") || "openintegration";
        return slug + "-" + suffix + ".png";
      }

      function fieldValueFromSettings(name, schema, values) {
        if (Object.prototype.hasOwnProperty.call(values, name)) {
          return values[name];
        }

        if (Object.prototype.hasOwnProperty.call(schema, "default")) {
          return schema.default;
        }

        return "";
      }

      function coerceFieldValue(element, schema) {
        const type = schema.type;

        if (type === "boolean") {
          return element.checked;
        }

        if (element.value === "") {
          return null;
        }

        if (type === "number" || type === "integer") {
          const number = Number(element.value);
          return Number.isFinite(number) ? number : null;
        }

        if (type === "array" || type === "object") {
          try {
            return JSON.parse(element.value);
          } catch {
            return element.value;
          }
        }

        return element.value;
      }

      function updateJsonFromForm() {
        if (syncingJson) {
          return;
        }

        let values = {};
        try {
          values = JSON.parse(settings.value || "{}");
        } catch {
          values = {};
        }

        for (const element of formFields.querySelectorAll("[data-setting-name]")) {
          const name = element.dataset.settingName;
          const property = config.formSchema?.properties?.[name] || {};
          values[name] = coerceFieldValue(element, property);
        }

        syncingJson = true;
        settings.value = JSON.stringify(values, null, 2);
        syncingJson = false;
        cacheState("Settings saved.");
        scheduleReload("Settings changed");
      }

      function syncFormFromJson() {
        if (syncingJson) {
          return;
        }

        let values = {};
        try {
          values = JSON.parse(settings.value || "{}");
        } catch {
          return;
        }

        syncingJson = true;

        for (const element of formFields.querySelectorAll("[data-setting-name]")) {
          const name = element.dataset.settingName;
          const property = config.formSchema?.properties?.[name] || {};
          const value = fieldValueFromSettings(name, property, values);

          if (property.type === "boolean") {
            element.checked = Boolean(value);
          } else if (property.type === "array" || property.type === "object") {
            element.value = value === "" ? "" : JSON.stringify(value, null, 2);
          } else {
            element.value = value ?? "";
          }
        }

        syncingJson = false;
      }

      function createField(name, property, required) {
        const wrapper = document.createElement("div");
        wrapper.className = "field";

        const title = document.createElement("div");
        title.className = "field-title";
        title.textContent = property.title || name;

        let input;

        if (property.type === "boolean") {
          const row = document.createElement("label");
          row.className = "field-row";
          const text = document.createElement("span");
          text.textContent = property.title || name;
          input = document.createElement("input");
          input.type = "checkbox";
          row.append(text, input);
          wrapper.append(row);
        } else {
          wrapper.append(title);

          if (Array.isArray(property.enum)) {
            input = document.createElement("select");
            const empty = document.createElement("option");
            empty.value = "";
            empty.textContent = required ? "Select..." : "None";
            input.append(empty);

            for (const optionValue of property.enum) {
              const option = document.createElement("option");
              option.value = String(optionValue);
              option.textContent = String(optionValue);
              input.append(option);
            }
          } else if (property.type === "array" || property.type === "object") {
            input = document.createElement("textarea");
            input.rows = 4;
          } else {
            input = document.createElement("input");
            input.type = property.type === "number" || property.type === "integer" ? "number" : "text";

            if (property.type === "integer") {
              input.step = "1";
            }
          }

          wrapper.append(input);
        }

        input.dataset.settingName = name;

        if (property.description) {
          const help = document.createElement("p");
          help.className = "field-help";
          help.textContent = property.description;
          wrapper.append(help);
        }

        input.addEventListener("input", updateJsonFromForm);
        input.addEventListener("change", updateJsonFromForm);

        return wrapper;
      }

      function renderFormFields() {
        formFields.innerHTML = "";
        const schema = config.formSchema;

        if (!isObject(schema) || schema.type !== "object" || !isObject(schema.properties)) {
          setPanel(schemaStatus, "Settings schema", "No object formSchema found.");
          return;
        }

        const required = Array.isArray(schema.required) ? schema.required : [];

        for (const [name, property] of Object.entries(schema.properties)) {
          if (name === "color" || !isObject(property)) {
            continue;
          }

          if (property.inStettingsPage === true || property.inStettingsPage === "true") {
            continue;
          }

          formFields.append(createField(name, property, required.includes(name)));
        }

        syncFormFromJson();
        setPanel(schemaStatus, "Settings schema", formFields.children.length + " generated field(s).");
      }

      function applyVariant(variant, index) {
        const nextSettings = settingsFromVariant(variant);

        syncingJson = true;
        settings.value = JSON.stringify(nextSettings, null, 2);
        syncingJson = false;
        syncColorFromJson();
        syncFormFromJson();
        cacheState("Variant " + (index + 1) + " applied.");
        reloadFrame();
      }

      function renderConfigVariants(cacheBust) {
        variantsList.innerHTML = "";
        const variants = Array.isArray(config.configVariants) ? config.configVariants : [];

        if (variants.length === 0) {
          setPanel(variantsStatus, "Variants", "No configVariants found.");
          regenerateVariants.disabled = true;
          return;
        }

        regenerateVariants.disabled = false;

        variants.forEach((variant, index) => {
          const card = document.createElement("article");
          card.className = "variant-card";

          const header = document.createElement("div");
          header.className = "variant-card-header";

          const title = document.createElement("div");
          title.className = "variant-title";
          title.textContent = variantTitle(index, variant);

          const apply = document.createElement("button");
          apply.type = "button";
          apply.textContent = "Apply";
          apply.addEventListener("click", () => applyVariant(variant, index));

          header.append(title, apply);
          card.append(header);

          const summary = document.createElement("pre");
          summary.className = "variant-settings";
          summary.textContent = variantSettingsSummary(variant);
          card.append(summary);

          const screenshots = isObject(variant) && isObject(variant.screenshots) ? variant.screenshots : {};
          const screenshotEntries = Object.entries(screenshots);

          if (screenshotEntries.length > 0) {
            const grid = document.createElement("div");
            grid.className = "variant-screenshots";

            for (const [size, path] of screenshotEntries) {
              if (typeof path !== "string") {
                continue;
              }

              const figure = document.createElement("figure");
              figure.className = "variant-screenshot";

              const image = document.createElement("img");
              image.src = assetUrl(path, cacheBust);
              image.alt = variantTitle(index, variant) + " " + size;
              image.loading = "lazy";

              const caption = document.createElement("figcaption");
              caption.textContent = size + " · " + path;

              figure.append(image, caption);
              grid.append(figure);
            }

            card.append(grid);
          }

          variantsList.append(card);
        });

        setPanel(variantsStatus, "Variants", variants.length + " configured variant(s).");
      }

      async function regenerateConfigVariantScreenshots() {
        const started = Date.now();

        regenerateVariants.disabled = true;
        setPanel(variantsStatus, "Regenerating", "Rendering configured screenshots.");

        try {
          const response = await fetch("/__paperless/config-variants/regenerate", {
            method: "POST"
          });
          const result = await response.json();
          const failures = Array.isArray(result.results)
            ? result.results.filter((entry) => entry && entry.ok === false)
            : [];

          renderConfigVariants(Date.now());

          if (!response.ok || failures.length > 0) {
            const detail = failures.slice(0, 3)
              .map((entry) => escapeText(entry.viewport || "unknown") + ": " + escapeText(entry.reason || "failed"))
              .join("<br>");
            setPanel(variantsStatus, "Regeneration failed", detail || "Could not regenerate screenshots.");
            return;
          }

          setPanel(
            variantsStatus,
            "Screenshots regenerated",
            String(result.generated || 0) + " file(s) in " + (Date.now() - started) + "ms."
          );
        } catch (error) {
          setPanel(variantsStatus, "Regeneration failed", escapeText(error.message || error));
        } finally {
          regenerateVariants.disabled = false;
        }
      }

      function frameUrl() {
        const url = new URL(renderPath, window.location.href);
        return url.href;
      }

      function applyViewport() {
        const [width, height] = viewport.value.split("x").map(Number);
        document.documentElement.style.setProperty("--preview-width", width + "px");
        document.documentElement.style.setProperty("--preview-height", height + "px");
        syncViewportPresets();
      }

      function updateViewport() {
        showLivePreview();
        applyViewport();
        cacheState("Viewport saved.");
      }

      function applyFrameTheme() {
        const doc = iframe.contentDocument;
        if (!doc?.body) {
          return;
        }

        doc.body.classList.remove(...colorThemes);

        if (color.value) {
          doc.body.classList.add(color.value);
        }
      }

      function sendInit() {
        showLivePreview();

        try {
          const payload = currentPayload();
          applyFrameTheme();
          iframe.contentWindow?.postMessage(
            {
              type: "INIT",
              cmd: "message",
              data: payload
            },
            window.location.origin
          );
          setStatus("INIT sent", "Waiting for ready marker.");
          setPanel(renderStatus, "Render", "INIT sent to iframe.");
          monitorReady();
        } catch (error) {
          setStatus("Settings error", String(error.message || error));
          setPanel(renderStatus, "Settings error", String(error.message || error));
        }
      }

      function monitorReady() {
        clearInterval(monitorTimer);
        clearTimeout(timeoutTimer);

        const started = Date.now();
        monitorTimer = setInterval(() => {
          const doc = iframe.contentDocument;
          if (!doc) {
            return;
          }

          const loaded = doc.querySelector("#website-has-loaded");
          const loading = doc.querySelector("#website-has-loading-element");

          if (loaded) {
            clearInterval(monitorTimer);
            clearTimeout(timeoutTimer);
            applyFrameTheme();
            setStatus("Ready", "Rendered in " + (Date.now() - started) + "ms.");
            setPanel(renderStatus, "Ready", "Rendered in " + (Date.now() - started) + "ms.");
            return;
          }

          if (loading) {
            setStatus("Rendering", "Loading marker is still present.");
            setPanel(renderStatus, "Rendering", "Loading marker is still present.");
          }
        }, 250);

        timeoutTimer = setTimeout(() => {
          clearInterval(monitorTimer);
          setStatus("Timed out", "No #website-has-loaded marker after 30s.");
          setPanel(renderStatus, "Timed out", "No #website-has-loaded marker after 30s.");
        }, 30000);
      }

      function reloadFrame() {
        showLivePreview();
        applyViewport();
        cacheState("Preview values saved.");
        setStatus("Loading iframe", "Waiting to send INIT.");
        setPanel(renderStatus, "Loading iframe", frameUrl());
        iframe.src = frameUrl();
      }

      function scheduleReload(reason) {
        clearTimeout(reloadTimer);
        setPanel(renderStatus, "Reload queued", reason);
        reloadTimer = setTimeout(reloadFrame, 250);
      }

      function reloadSettingsFrame() {
        if (!settingsFrame || !settingsPath) {
          return;
        }

        const url = new URL(settingsPath, window.location.href);
        settingsFrame.src = url.href;
      }

      function settingsFromMessage(message) {
        if (!isObject(message)) {
          return undefined;
        }

        if (isObject(message.pluginSettings)) {
          return message.pluginSettings;
        }

        if (isObject(message.settings)) {
          return message.settings;
        }

        if (isObject(message.data)) {
          if (isObject(message.data.pluginSettings)) {
            return message.data.pluginSettings;
          }

          if (isObject(message.data.settings)) {
            return message.data.settings;
          }
        }

        return undefined;
      }

      function handleSettingsPageMessage(event) {
        if (!settingsFrame || event.source !== settingsFrame.contentWindow) {
          return;
        }

        const message = event.data;

        if (!isObject(message)) {
          return;
        }

        if (message.type === "paperlesspaper:settings:ready" || message.type === "INIT_REQUEST") {
          sendSettingsPageInit();
          return;
        }

        const nextSettings = settingsFromMessage(message);
        if (!nextSettings) {
          return;
        }

        updatePluginSettings(nextSettings, "Settings page changed.");
      }

      async function renderWithPuppeteerOutput({ optimize, pendingTitle, pendingDetail, readyTitle, failedTitle, downloadSuffix }) {
        showLivePreview();

        try {
          const [width, height] = viewport.value.split("x").map(Number);
          const payload = currentPayload();
          setPanel(rendererStatus, pendingTitle, pendingDetail);
          const response = await fetch("/__paperless/render", {
            body: JSON.stringify({
              color: color.value || undefined,
              height,
              optimize,
              payload,
              width
            }),
            headers: {
              "Content-Type": "application/json"
            },
            method: "POST"
          });

          if (!response.ok) {
            throw new Error(await response.text());
          }

          const blob = await response.blob();
          deviceObjectUrl = URL.createObjectURL(blob);
          const image = new Image();
          image.src = deviceObjectUrl;
          await image.decode();
          showRenderedPreview(deviceObjectUrl);
          rendererDownloadName = downloadName(downloadSuffix);
          rendererDownload.disabled = false;

          const details = [
            image.width + "x" + image.height,
            "ready marker: " + response.headers.get("X-Paperless-Render-Ready"),
            "optimized: " + response.headers.get("X-Paperless-Render-Optimized")
          ];

          if (optimize) {
            details.push(
              "image kind: " + (response.headers.get("X-Paperless-Epd-Image-Kind") || "unknown"),
              "preset: " + (response.headers.get("X-Paperless-Epd-Processing-Preset") || "auto"),
              "device colors: " + (response.headers.get("X-Paperless-Epd-Used-Colors") || "none")
            );
          } else {
            details.push("PNG generated by local Chrome");
          }

          setPanel(
            rendererStatus,
            readyTitle,
            details.map(escapeText).join("<br>")
          );
        } catch (error) {
          showLivePreview();
          setPanel(rendererStatus, failedTitle, escapeText(error.message || error));
        }
      }

      iframe.addEventListener("load", () => {
        applyFrameTheme();
        setTimeout(sendInit, 50);
      });
      settingsFrame?.addEventListener("load", () => {
        setTimeout(sendSettingsPageInit, 50);
      });
      window.addEventListener("message", handleSettingsPageMessage);
      document.querySelector("#send").addEventListener("click", sendInit);
      document.querySelector("#reload").addEventListener("click", reloadFrame);
      document.querySelector("#reset").addEventListener("click", resetCachedState);
      regenerateVariants.addEventListener("click", regenerateConfigVariantScreenshots);
      document.querySelector("#puppeteer-render").addEventListener("click", () => {
        renderWithPuppeteerOutput({
          downloadSuffix: "puppeteer",
          failedTitle: "Puppeteer render failed",
          optimize: false,
          pendingDetail: "Rendering with local Chrome.",
          pendingTitle: "Puppeteer",
          readyTitle: "Puppeteer render ready"
        });
      });
      document.querySelector("#epd-render").addEventListener("click", () => {
        renderWithPuppeteerOutput({
          downloadSuffix: "device",
          failedTitle: "EPD render failed",
          optimize: true,
          pendingDetail: "Rendering with local Chrome and epdoptimize.",
          pendingTitle: "EPD optimize",
          readyTitle: "EPD render ready"
        });
      });
      document.querySelector("#show-live").addEventListener("click", () => {
        showLivePreview();
        setPanel(rendererStatus, "Live preview", "Showing iframe preview.");
      });
      rendererDownload.addEventListener("click", () => {
        if (!deviceObjectUrl) {
          return;
        }

        const link = document.createElement("a");
        link.href = deviceObjectUrl;
        link.download = rendererDownloadName || downloadName("render");
        link.click();
      });
      viewport.addEventListener("change", () => {
        updateViewport();
      });
      viewportPresets.forEach((button) => {
        button.addEventListener("click", () => {
          selectValue(viewport, button.dataset.viewport, defaultViewportValue);
          updateViewport();
        });
      });
      color.addEventListener("change", () => {
        syncSettingsColorFromSelect();
        syncFormFromJson();
        cacheState("Settings saved.");
        reloadFrame();
      });
      language?.addEventListener("change", () => {
        cacheState("Language saved.");
        reloadFrame();
      });
      settings.addEventListener("input", () => {
        syncFormFromJson();
        syncColorFromJson();
        cacheState("Raw settings saved.");
        scheduleReload("Raw settings changed");
      });

      if (window.EventSource) {
        const events = new EventSource("/__paperless/events");
        events.addEventListener("ready", (event) => {
          const data = JSON.parse(event.data);
          setPanel(devStatus, "Dev server", data.watch ? "Watching files." : "File watch disabled.");
        });
        events.addEventListener("reload", (event) => {
          const data = JSON.parse(event.data);
          const file = data.file || "integration file";
          setPanel(devStatus, "File changed", file);
          reloadFrame();
          reloadSettingsFrame();
        });
        events.onerror = () => {
          setPanel(devStatus, "Dev server", "Live reload disconnected.");
        };
      } else {
        setPanel(devStatus, "Dev server", "EventSource is not available.");
      }

      hydrateCachedState();
      renderFormFields();
      renderConfigVariants();
      applyViewport();
      reloadSettingsFrame();
      reloadFrame();
    </script>
  </body>
</html>`;
}
