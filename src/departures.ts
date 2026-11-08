import { escapeHtml } from "./html";
import { loadLanguageJson } from "./language";
import { markError, markLoading, markReady } from "./ready";
import { waitForPayload } from "./runtime";
import { getQuerySettings, getSettings, mergeSettings } from "./settings";
import { applyColorTheme, normalizeColorTheme } from "./theme";
import { fitText } from "./fitText";
import type { JsonRecord } from "./types";

export interface Departure {
  line: string; direction: string; when: string; plannedWhen?: string;
  delayMinutes?: number | null; platform?: string; plannedPlatform?: string;
  platformChanged?: boolean; cancelled?: boolean; operator?: string;
}
export interface DepartureBoardData {
  station?: { name?: string }; departures: Departure[]; duration?: number;
  source?: string; updatedAt?: string; more?: number; partial?: boolean; sample?: boolean;
}
export interface DepartureBoardOptions {
  defaults: JsonRecord; brand: string; timeZone: string; locale?: string;
  target?: string | HTMLElement; apiPath?: string;
}
const fallbackMessages: Record<string, string> = {
  departures: 'Departures', next: 'Next departure', time: 'Time', line: 'Line', direction: 'Destination',
  platform: 'Platform', platformShort: 'Pl.', planned: 'Sched.', forecast: 'Forecast', onTime: 'On time',
  timetable: 'Timetable', changed: 'Platform change', updated: 'Updated', example: 'Example data',
  window: 'Next {minutes} min', more: '+{count} more', partial: 'Limited timetable extract',
  empty: 'No matching departures', emptyHint: 'Check the station, filters or time window.',
  errorTitle: 'Departures unavailable', upstream: 'The source is unavailable. Please try again later.',
  loading: 'Loading departures', filter: 'Filter', cancelled: 'Cancelled'
};
const yes = (value: unknown) => value === true || value === 'true' || value === 1 || value === '1';

/** Common presentation; provider adapters retain station lookup, filtering and source semantics. */
export function renderDepartureBoard(app: HTMLElement, data: DepartureBoardData, settings: JsonRecord, copy: JsonRecord = {}, brand = ''): void {
  const e = escapeHtml;
  const messages = { ...fallbackMessages };
  for (const [key, value] of Object.entries(copy)) if (typeof value === 'string') messages[key] = value;
  const locale = String(settings.locale || document.documentElement.lang || 'en-GB');
  const timeZone = String(settings.timeZone || 'Europe/Zurich');
  const time = new Intl.DateTimeFormat(locale, { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const clock = (value?: string) => value && Number.isFinite(Date.parse(value)) ? time.format(new Date(value)) : '—';
  const stamp = data.updatedAt && Number.isFinite(Date.parse(data.updatedAt)) ? new Date(data.updatedAt) : null;
  const date = stamp ? new Intl.DateTimeFormat(locale, { timeZone, day: '2-digit', month: 'short' }).format(stamp) : '—';
  const status = (row: Departure) => row.cancelled ? messages.cancelled : row.delayMinutes == null ? messages.timetable : row.delayMinutes === 0 ? messages.onTime : `${row.delayMinutes > 0 ? '+' : ''}${row.delayMinutes} min`;
  const statusClass = (row: Departure) => row.cancelled ? 'cancelled' : (row.delayMinutes ?? 0) > 0 ? 'delay' : '';
  const changed = (row: Departure) => yes(settings.showPlatformChanges) && row.platformChanged;
  const departures = data.departures.slice(0, 100);
  const first = departures[0];
  const filter = [settings.destination, settings.lines, settings.transport === 'all' ? '' : settings.transport].filter(Boolean).join(' · ');
  app.classList.add('pp-departures');
  app.dataset.more = String(Math.max(0, Number(data.more) || 0));
  app.dataset.moreLabel = messages.more;
  app.innerHTML = `<header><div class="heading"><p class="eyebrow">${e(messages.departures)} · ${e(brand)}</p><h1>${e(data.station?.name || settings.stationName || '—')}</h1></div><div class="header-meta">${data.sample ? `<span class="sample">${e(messages.example)}</span>` : ''}${e(date)}</div></header>
          ${first ? `<section class="hero ${first.cancelled ? 'is-cancelled' : ''}">
            <div class="hero-time"><p class="eyebrow">${e(messages.next)}</p><div class="hero-clock">${e(clock(first.when))}</div><div class="small">${e(first.cancelled ? messages.cancelled : first.delayMinutes != null ? messages.forecast : messages.timetable)}${first.plannedWhen && first.when !== first.plannedWhen ? ` · ${e(messages.planned)} ${e(clock(first.plannedWhen))}` : ''}</div></div>
            <div class="hero-main"><span class="line">${e(first.line)}</span><h2>${e(first.direction || '—')}</h2><div class="hero-status"><span class="status ${statusClass(first)}">${e(status(first))}</span><span class="small">${e(first.operator || '')}</span></div></div>
            <div class="platform"><span class="small">${e(messages.platform)}</span><strong class="${changed(first) ? 'changed' : ''}">${e(first.platform || '—')}</strong>${changed(first) ? `<div class="changed-label">↔ ${e(messages.changed)}<br>${e(first.plannedPlatform)} → ${e(first.platform)}</div>` : ''}</div>
          </section><section class="board"><div class="board-head"><span>${e(messages.time)}</span><span>${e(messages.line)}</span><span>${e(messages.direction)}</span><span>${e(messages.platformShort)}</span></div>${departures.slice(1).map(row => `<div class="row ${row.cancelled ? 'is-cancelled' : ''}"><div class="row-clock"><span class="row-time">${e(clock(row.when))}</span><br><span class="status ${statusClass(row)}">${e(status(row))}</span></div><div><span class="line">${e(row.line)}</span></div><div class="destination">${e(row.direction || '—')}</div><div class="row-platform"><span class="${changed(row) ? 'changed' : ''}">${changed(row) ? '↔ ' : ''}${e(row.platform || '—')}</span></div></div>`).join('')}</section>` : `<section class="empty"><h2>${e(messages.empty)}</h2><p>${e(messages.emptyHint)}</p></section>`}
          <footer><div class="footer-row"><span>${e(messages.window.replace('{minutes}', String(data.duration ?? settings.duration ?? 90)))}</span><span class="filter">${filter ? `${e(messages.filter)}: ${e(filter)}` : ''}</span><strong class="more"></strong></div><div class="footer-row"><span class="footer-note">${e(data.source)}${data.partial ? ` · ${e(messages.partial)}` : ''}</span><span>${e(messages.updated)} ${e(clock(data.updatedAt))}</span></div></footer>`;
}

/** Fit text first, then omit only whole rows. Recompute after every resize. */
export function fitDepartureBoard(app: HTMLElement): void {
  const title = app.querySelector<HTMLElement>('h1');
  if (title) fitText(title, { min: 18, max: Math.min(65, window.innerWidth * .06, window.innerHeight * .06) });
  const destination = app.querySelector<HTMLElement>('.hero h2');
  if (destination) fitText(destination, { min: 17, max: Math.min(52, window.innerWidth * .05, window.innerHeight * .05) });
  const rows = [...app.querySelectorAll<HTMLElement>('.row')];
  rows.forEach(row => row.hidden = false);
  const board = app.querySelector<HTMLElement>('.board');
  let hidden = 0;
  if (board) for (let i = rows.length - 1; i >= 0 && rows[i].getBoundingClientRect().bottom > board.getBoundingClientRect().bottom + 1; i--) { rows[i].hidden = true; hidden++; }
  const more = app.querySelector<HTMLElement>('.more');
  const count = hidden + Number(app.dataset.more || 0);
  if (more) more.textContent = count ? (app.dataset.moreLabel || fallbackMessages.more).replace('{count}', String(count)) : '';
}

export async function bootDepartureIntegration(options: DepartureBoardOptions): Promise<void> {
  const app = typeof options.target === 'string' ? document.querySelector<HTMLElement>(options.target) : options.target || document.querySelector<HTMLElement>('#app');
  if (!app) throw Error('Missing departure board target');
  app.classList.add('pp-departures');
  let sequence = 0;
  let controller: AbortController | undefined;
  async function renderPayload(payload: JsonRecord): Promise<void> {
    const target = app!;
    const version = ++sequence;
    controller?.abort(); controller = new AbortController();
    const signal = controller.signal;
    markLoading();
    let messages = { ...fallbackMessages };
    try {
      const localized = await loadLanguageJson(payload);
      if (version !== sequence) return;
      for (const [key, value] of Object.entries(localized.messages)) if (typeof value === 'string') messages[key] = value;
      document.documentElement.lang = localized.language;
      const settings = mergeSettings(options.defaults, getSettings(payload), getQuerySettings());
      applyColorTheme(String(settings.color || options.defaults.color || 'red-light'), { defaultTheme: normalizeColorTheme(String(options.defaults.color || 'red-light')) });
      target.innerHTML = `<section class="empty"><h2>${escapeHtml(messages.loading)}</h2></section>`;
      const response = await fetch(new URL(options.apiPath || './api/data', location.href), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings), signal
      });
      if (!response.ok) throw Error('upstream');
      const data = await response.json();
      if (version !== sequence) return;
      if (data.error) throw Error(String(data.error));
      if (!Array.isArray(data.departures)) throw Error('upstream');
      renderDepartureBoard(target, data, { ...settings, timeZone: settings.timeZone || options.timeZone, locale: settings.locale || options.locale || localized.language }, messages, options.brand);
      await document.fonts?.ready;
      if (version !== sequence) return;
      fitDepartureBoard(target); markReady();
    } catch (error) {
      if (version !== sequence || signal.aborted) return;
      const key = error instanceof Error ? error.message : 'upstream';
      target.innerHTML = `<section class="empty"><p class="eyebrow">${escapeHtml(options.brand)}</p><h2>${escapeHtml(messages.errorTitle)}</h2><p>${escapeHtml(messages[key] || messages.upstream)}</p></section>`;
      markError(error);
    }
  }
  window.addEventListener('resize', () => fitDepartureBoard(app));
  const payload = await waitForPayload({ timeoutMs: 500, onUpdate: renderPayload });
  await renderPayload(payload);
}
