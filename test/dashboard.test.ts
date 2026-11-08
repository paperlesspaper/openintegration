import { describe, expect, it } from "vitest";
import { renderDashboard, fitDashboard } from "../src/dashboard";

function target() { document.body.innerHTML = '<main id="app"></main>'; return document.querySelector<HTMLElement>("#app")!; }
describe("connected dashboards", () => {
  it("escapes provider content and restricts semantic CSS classes", () => {
    const el = target();
    renderDashboard(el, { source: '<img src=x onerror="alert(1)">', rows: [{ title: '<script>alert(1)</script>', tone: 'red" onclick="evil()' }] }, { title: 'Safe' });
    expect(el.querySelector("img, script, [onclick]")).toBeNull();
    expect(el.textContent).toContain('<script>alert(1)</script>');
    expect(el.querySelector('.pp-dash-row')?.classList.contains('pp-dash-accent')).toBe(true);
  });
  it("distinguishes unknown metrics from real zeroes and labels demo data", () => {
    const el = target();
    renderDashboard(el, { sample: true, metrics: [{ label: 'Missing', value: null }, { label: 'Zero', value: 0 }] }, {}, { sample: 'BEISPIELDATEN' });
    expect(el.textContent).toContain('BEISPIELDATEN');
    expect(el.querySelectorAll('.pp-dash-metric strong')[0]?.textContent).toBe('—');
    expect(el.querySelectorAll('.pp-dash-metric strong')[1]?.textContent).toBe('0');
  });
  it("does not connect a chart line across missing measurements", () => {
    const el = target();
    renderDashboard(el, { chart: { label: 'Test', points: [{ label: '1', value: 1 }, { label: '2', value: null }, { label: '3', value: 2 }] } }, {});
    expect(el.querySelectorAll('polyline')).toHaveLength(2);
  });
  it("fits whole rows, reports omissions and restores rows on resize", () => {
    const el = target();
    renderDashboard(el, { total: 5, rows: [{ title: 'A' }, { title: 'B' }, { title: 'C' }] }, {}, { more: '+{count} weitere' });
    const content = el.querySelector<HTMLElement>('.pp-dash-content')!;
    let bottom = 50;
    content.getBoundingClientRect = () => ({ bottom } as DOMRect);
    [...el.querySelectorAll<HTMLElement>('.pp-dash-row')].forEach((row, i) => { row.getBoundingClientRect = () => ({ bottom: 20 + i * 25 } as DOMRect); });
    fitDashboard(el);
    expect(el.querySelectorAll('.pp-dash-row[hidden]')).toHaveLength(1);
    expect(el.querySelector('.pp-dash-count')?.textContent).toBe('+3 weitere');
    bottom = 100;
    fitDashboard(el);
    expect(el.querySelectorAll('.pp-dash-row[hidden]')).toHaveLength(0);
    expect(el.querySelector('.pp-dash-count')?.textContent).toBe('+2 weitere');
  });
});
