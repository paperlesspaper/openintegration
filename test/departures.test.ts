import { describe, expect, it } from "vitest";
import { renderDepartureBoard, fitDepartureBoard, type DepartureBoardData } from "../src/departures";

const data = (): DepartureBoardData => ({ station: { name: 'Niederweningen' }, source: 'provider', updatedAt: '2026-10-06T06:30:00Z', duration: 90, more: 2,
  departures: [
    { line: 'S 15', direction: 'Niederweningen', when: '2026-10-06T06:35:00Z', delayMinutes: null },
    { line: 'IC 1', direction: 'Hamburg', when: '2026-10-06T06:40:00Z', delayMinutes: 5, cancelled: true },
    { line: 'RE 1', direction: 'Leipzig', when: '2026-10-06T06:45:00Z', delayMinutes: 0, platform: '3', plannedPlatform: '2', platformChanged: true },
  ] });
function target() { document.body.innerHTML = '<main id="app"></main>'; return document.querySelector<HTMLElement>('#app')!; }
describe('shared departure board', () => {
  it('localizes cancellation and preserves unknown versus observed on-time states', () => {
    const el = target();
    renderDepartureBoard(el, data(), {}, { cancelled: 'Fällt aus', timetable: 'Fahrplan', onTime: 'Pünktlich' }, 'DB');
    expect(el.querySelector('.hero-status')?.textContent).toContain('Fahrplan');
    expect(el.querySelector('.row .cancelled')?.textContent).toBe('Fällt aus');
    expect(el.querySelectorAll('.row .status')[1]?.textContent).toBe('Pünktlich');
    expect(el.querySelector('.hero-time .small')?.textContent).not.toContain('Sched.');
  });
  it('uses the same markup for both providers and escapes all names and labels', () => {
    const el = target(); const board = data();
    board.station!.name = '<img src=x onerror=alert(1)>';
    board.departures[0].direction = '<script>evil()</script>';
    renderDepartureBoard(el, board, { destination: '<img src=x>' }, {}, '<img src=x>');
    expect(el.querySelector('img,script')).toBeNull();
    expect(el.textContent).toContain('<script>evil()</script>');
  });
  it('hides and restores complete rows with the correct omission count', () => {
    const el = target(); renderDepartureBoard(el, data(), {}, { more: '+{count} weitere' });
    const board = el.querySelector<HTMLElement>('.board')!;
    let bottom = 80;
    board.getBoundingClientRect = () => ({ bottom } as DOMRect);
    el.querySelectorAll<HTMLElement>('.row').forEach((row,i) => row.getBoundingClientRect = () => ({ bottom: 60 + i * 40 } as DOMRect));
    fitDepartureBoard(el);
    expect(el.querySelectorAll('.row[hidden]')).toHaveLength(1);
    expect(el.querySelector('.more')?.textContent).toBe('+3 weitere');
    bottom = 120; fitDepartureBoard(el);
    expect(el.querySelectorAll('.row[hidden]')).toHaveLength(0);
    expect(el.querySelector('.more')?.textContent).toBe('+2 weitere');
  });
  it('honors string boolean settings and labels a cancelled first departure', () => {
    const el = target(); const board = data(); board.departures[0].cancelled = true;
    for (const showPlatformChanges of [false, 'false']) {
      renderDepartureBoard(el, board, { showPlatformChanges });
      expect(el.querySelector('.changed')).toBeNull();
      expect(el.querySelector('.hero.is-cancelled .cancelled')?.textContent).toBe('Cancelled');
    }
    renderDepartureBoard(el, board, { showPlatformChanges: 'true' });
    expect(el.querySelector('.changed')).not.toBeNull();
  });
});
