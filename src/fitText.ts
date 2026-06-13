import type { FitTextOptions } from "./types";

function px(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function overflows(element: HTMLElement): boolean {
  return element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight;
}

export function fitText(element: HTMLElement, options: FitTextOptions = {}): void {
  const { min = 8, step = 1, nowrap = false } = options;
  const computed = window.getComputedStyle(element);
  const startingSize = px(computed.fontSize) || options.max || 16;
  const max = options.max ?? startingSize;

  if (nowrap) {
    element.style.whiteSpace = "nowrap";
  }

  let size = Math.min(startingSize, max);
  element.style.fontSize = `${size}px`;

  while (size > min && overflows(element)) {
    size = Math.max(min, size - step);
    element.style.fontSize = `${size}px`;
  }
}

export function fitAllText(
  selector = ".pp-fit",
  options?: FitTextOptions
): void {
  if (typeof document === "undefined") {
    return;
  }

  for (const element of document.querySelectorAll<HTMLElement>(selector)) {
    fitText(element, options);
  }
}
