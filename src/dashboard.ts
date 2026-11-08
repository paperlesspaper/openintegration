import { escapeHtml } from "./html";
import { loadLanguageJson } from "./language";
import { markError, markLoading, markReady } from "./ready";
import { waitForPayload } from "./runtime";
import { getQuerySettings, getSettings, mergeSettings } from "./settings";
import { applyColorTheme, normalizeColorTheme } from "./theme";
import type { JsonRecord } from "./types";

export interface DashboardRow { title: string; detail?: string; badge?: string; tone?: string; icon?: string }
export interface DashboardMetric { label: string; value: string | number | null; unit?: string; tone?: string }
export interface DashboardData {
  source?: string; sample?: boolean; updatedAt?: string; subtitle?: string; note?: string;
  partial?: boolean; total?: number;
  metrics?: DashboardMetric[]; rows?: DashboardRow[];
  columns?: { title: string; rows: DashboardRow[]; total?: number }[];
  chart?: { label: string; unit?: string; points: { label: string; value: number | null }[] };
  heatmap?: { date: string; count: number }[];
}
export interface DashboardOptions { defaults: JsonRecord; target?: string | HTMLElement; apiPath?: string; title?: string }
const safe = (v: unknown, n = 180) => escapeHtml(String(v ?? "").slice(0, n));
const tone = (v: unknown) => ["green", "blue", "red", "orange"].includes(String(v)) ? String(v) : "accent";
const iconPaths: Record<string, string> = {
  leaf: '<path d="M7 27C2 9 15 4 28 4c1 14-4 26-21 23ZM7 28 23 10"/>',
  bread: '<path d="M8 11C1 6 1 24 8 22v9h20v-9c7 2 7-16 0-11-3-10-17-10-20 0ZM15 15v9m7-9v9"/>',
  bottle: '<path d="M14 3h8v7l5 6v16H9V16l5-6ZM9 21h18"/>',
  cup: '<path d="M6 12h20v13c0 10-20 10-20 0ZM26 15h4c9 0 5 12-4 10M10 3v4m7-4v4m7-4v4"/>',
  cart: '<path d="M3 4h5l4 21h17l4-15H10M14 31h1m11 0h1"/>',
  plant: '<path d="M9 23h20l-4 11H13ZM19 23V11M19 18C5 21 4 9 7 5c9 0 14 7 12 13ZM19 13c0-9 7-12 13-11 1 8-5 13-13 11Z"/>',
  bird: '<path d="M5 27c12 7 24-2 22-12l7-4-8-2c-6-7-13-2-13 4L3 19l10 1c-2 3-5 5-8 7ZM17 29l-2 5m9-7 2 7"/>',
};
const iconHtml = (name?: string) => name && iconPaths[name] ? `<svg class="pp-dash-icon" viewBox="0 0 38 38" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">${iconPaths[name]}</svg>` : '';
const list = <T>(v: T[] | undefined, n = 100): T[] => Array.isArray(v) ? v.slice(0, n) : [];

/** A small display vocabulary for provider adapters: metrics, lists, boards and charts. */
export function renderDashboard(target: HTMLElement, data: DashboardData, settings: JsonRecord, messages: JsonRecord = {}): void {
  const msg = (key: string, fallback: string) => String(messages[key] || fallback);
  const locale = document.documentElement.lang === "de" ? "de-DE" : "en-GB";
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const format = (value: unknown) => value === null || value === undefined ? "—" : typeof value === "number" ? nf.format(value) : String(value);
  const rowHtml = (r: DashboardRow) => `<article class="pp-dash-row pp-dash-${tone(r.tone)}"><div class="pp-dash-row-main">${iconHtml(r.icon)}<div><h2>${safe(r.title)}</h2>${r.detail ? `<p>${safe(r.detail)}</p>` : ""}</div></div>${r.badge ? `<strong class="pp-dash-badge">${safe(r.badge, 48)}</strong>` : ""}</article>`;
  let stamp = "—";
  if (data.updatedAt && Number.isFinite(Date.parse(data.updatedAt))) {
    stamp = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short", timeZone: String(settings.timeZone || "Europe/Berlin") }).format(new Date(data.updatedAt));
  }
  const metrics = list(data.metrics, 4);
  const rows = list(data.rows);
  const columns = list(data.columns, 4);
  const heatmap = list(data.heatmap, 371);
  const chart = data.chart;
  let graphic = "";
  if (chart) {
    const points = list(chart.points, 72);
    const valid = points.filter(p => p.value !== null && Number.isFinite(p.value));
    const min = Math.min(0, ...valid.map(p => Number(p.value)));
    const max = Math.max(1, ...valid.map(p => Number(p.value)));
    const xy = (p: { value: number | null }, i: number) => `${20 + i * 760 / Math.max(1, points.length - 1)},${140 - ((Number(p.value) - min) / (max - min)) * 120}`;
    // Gaps remain gaps; do not invent measurements by connecting missing points.
    const segments: string[] = []; let current: string[] = [];
    points.forEach((p, i) => { if (p.value !== null && Number.isFinite(p.value)) current.push(xy(p, i)); else if (current.length) { segments.push(current.join(" ")); current = []; } });
    if (current.length) segments.push(current.join(" "));
    graphic = `<section class="pp-dash-chart"><h2>${safe(chart.label)}${chart.unit ? ` · ${safe(chart.unit)}` : ""}</h2><svg viewBox="0 0 800 162" role="img" aria-label="${safe(chart.label)}"><path d="M20 140H780" stroke="currentColor" fill="none"/>${segments.map(points => `<polyline points="${points}" fill="none" stroke="var(--pp-accent)" stroke-width="5"/>`).join("")}</svg><div class="pp-dash-axis"><span>${safe(points[0]?.label)}</span><span>${safe(nf.format(min))} – ${safe(nf.format(max))} ${safe(chart.unit)}</span><span>${safe(points.at(-1)?.label)}</span></div></section>`;
  }
  if (heatmap.length) {
    const max = Math.max(1, ...heatmap.map(x => x.count));
    const weekday = new Date(`${heatmap[0].date}T12:00:00Z`).getUTCDay();
    graphic += `<section class="pp-dash-activity"><div class="pp-dash-heatmap">${Array.from({length: weekday}, () => '<span class="pp-dash-day pp-dash-spacer"></span>').join("")}${heatmap.map(d => `<span class="pp-dash-day ${d.count > 0 ? 'pp-dash-active' : ''}" title="${safe(d.date)}: ${safe(d.count)}" style="--level:${d.count > max / 2 ? 1 : 0.55}"></span>`).join("")}</div><div class="pp-dash-axis"><span>${safe(heatmap[0]?.date)}</span><span>${safe(msg("contributions", "Contributions"))}</span><span>${safe(heatmap.at(-1)?.date)}</span></div></section>`;
  }
  const content = columns.length ? `<div class="pp-dash-board">${columns.map(c => `<section class="pp-dash-column"><h2>${safe(c.title)}</h2><div class="pp-dash-list">${list(c.rows).map(rowHtml).join("")}</div><small class="pp-dash-column-count" data-total="${Number(c.total ?? c.rows.length)}"></small></section>`).join("")}</div>` : `<div class="pp-dash-list">${rows.map(rowHtml).join("")}</div>`;
  target.classList.add("pp-dashboard");
  target.innerHTML = `<header class="pp-dash-header"><div class="pp-dash-eyebrow">${safe(data.sample ? msg("sample", "DEMO DATA") : data.source)}</div><h1>${safe(settings.title || messages.title || "Dashboard", 80)}</h1>${data.subtitle ? `<p>${safe(data.subtitle)}</p>` : ""}</header>${metrics.length ? `<section class="pp-dash-metrics">${metrics.map(m => `<article class="pp-dash-metric pp-dash-${tone(m.tone)}"><p>${safe(m.label)}</p><strong>${safe(format(m.value), 40)}<small>${safe(m.unit)}</small></strong></article>`).join("")}</section>` : ""}<section class="pp-dash-content">${graphic}${content}${!rows.length && !columns.length && !graphic && !metrics.length ? `<p class="pp-dash-empty">${safe(msg("empty", "No entries"))}</p>` : ""}</section><p class="pp-dash-note">${safe(data.partial ? msg("partial", "Partial data") + " · " : "")}${safe(data.note, 280)}</p><footer class="pp-dash-footer"><span class="pp-dash-count" data-total="${Number(data.total ?? rows.length)}">${safe(data.source)}</span><span>${safe(msg("updated", "Retrieved"))} ${safe(stamp)}</span></footer>`;
  target.dataset.moreLabel = msg("more", "+{count} more");
}

/** Remove entire trailing rows and disclose the count. Restore on each resize. */
export function fitDashboard(target: HTMLElement): void {
  target.querySelectorAll<HTMLElement>(".pp-dash-row").forEach(r => { r.hidden = false; });
  const content = target.querySelector<HTMLElement>(".pp-dash-content");
  if (!content) return;
  const lists = Array.from(target.querySelectorAll<HTMLElement>(".pp-dash-list"));
  for (const container of lists) {
    const rows = Array.from(container.querySelectorAll<HTMLElement>(".pp-dash-row"));
    let visible = rows.length;
    const overflow = () => {
      const last = rows[visible - 1];
      const limit = target.querySelector(".pp-dash-board") ? container.getBoundingClientRect().bottom : content.getBoundingClientRect().bottom;
      return last && last.getBoundingClientRect().bottom > limit + 1;
    };
    while (visible > 0 && overflow()) rows[--visible].hidden = true;
    const count = container.parentElement?.querySelector<HTMLElement>(".pp-dash-column-count") || target.querySelector<HTMLElement>(".pp-dash-count");
    if (count) {
      const hidden = Math.max(0, Number(count.dataset.total || rows.length) - visible);
      count.textContent = hidden ? (target.dataset.moreLabel || "+{count} more").replace("{count}", String(hidden)) : "";
    }
  }
}

export async function bootDashboardIntegration(options: DashboardOptions): Promise<void> {
  const target = typeof options.target === "string" ? document.querySelector<HTMLElement>(options.target) : options.target || document.querySelector<HTMLElement>("#app");
  if (!target) throw new Error("Dashboard target not found");
  let revision = 0;
  let controller: AbortController | undefined;
  async function renderPayload(payload: JsonRecord) {
    const current = ++revision;
    controller?.abort(); controller = new AbortController();
    const activeController = controller;
    const signal = activeController.signal;
    markLoading();
    let messages: JsonRecord = {};
    try {
      const loaded = await loadLanguageJson(payload, { supported: ["de", "en"] });
      if (current !== revision) return;
      messages = loaded.messages;
      document.documentElement.lang = loaded.language;
      const settings = mergeSettings(options.defaults, getSettings(payload), getQuerySettings());
      applyColorTheme(String(settings.color || ""), { defaultTheme: normalizeColorTheme(String(options.defaults.color || "blue-light")) });
      const url = new URL(options.apiPath || "./api/data", location.href);
      if (url.origin !== location.origin) throw new Error("Dashboard API must be same-origin");
      const timer = setTimeout(() => activeController.abort(), 45000);
      let response: Response;
      try {
        response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...settings, language: loaded.language }), signal });
      } finally { clearTimeout(timer); }
      if (!response.ok) throw new Error("Provider request failed");
      const data = await response.json() as DashboardData;
      if (current !== revision) return;
      renderDashboard(target!, data, settings, messages);
      await document.fonts?.ready;
      if (current !== revision) return;
      fitDashboard(target!);
      markReady();
    } catch {
      if (current !== revision) return;
      const title = String(messages.error || "Could not load data");
      target!.classList.add("pp-dashboard");
      target!.innerHTML = `<header class="pp-dash-header"><h1>${safe(title)}</h1></header><p>${safe(messages.setup || "Check the integration settings and connection.", 300)}</p>`;
      markError(new Error(title));
    }
  }
  window.addEventListener("resize", () => fitDashboard(target));
  const payload = await waitForPayload({ timeoutMs: 500, onUpdate: renderPayload });
  await renderPayload(payload);
}
