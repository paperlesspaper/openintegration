import type { FitTextOptions } from "./types";

function px(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function contentWidth(element: HTMLElement): number {
  const style = window.getComputedStyle(element);
  const width = element.clientWidth || element.offsetWidth;
  return Math.max(0, width - px(style.paddingLeft) - px(style.paddingRight));
}

function contentHeight(element: HTMLElement): number {
  const style = window.getComputedStyle(element);
  const height = element.clientHeight || element.offsetHeight;
  return Math.max(0, height - px(style.paddingTop) - px(style.paddingBottom));
}

function fitTarget(element: HTMLElement, fitParent: boolean | HTMLElement): HTMLElement {
  if (fitParent instanceof HTMLElement) {
    return fitParent;
  }

  if (fitParent && element.parentElement) {
    return element.parentElement;
  }

  return element;
}

function overflows(element: HTMLElement, tolerance: number, fitParent: boolean | HTMLElement): boolean {
  const target = fitTarget(element, fitParent);
  const elementWidth = element.clientWidth || element.offsetWidth;
  const targetWidth =
    target === element
      ? elementWidth
      : Math.min(contentWidth(target), elementWidth || Number.POSITIVE_INFINITY);
  const targetHeight =
    target === element ? target.clientHeight || target.offsetHeight : contentHeight(target);

  return (
    element.scrollWidth - targetWidth > tolerance ||
    element.scrollHeight - targetHeight > tolerance
  );
}

export function fitText(element: HTMLElement, options: FitTextOptions = {}): void {
  const {
    min = 8,
    step = 1,
    tolerance = 2,
    lineBreak = false,
    nowrap = false,
    fitParent = false
  } = options;
  const computed = window.getComputedStyle(element);
  const startingSize = px(computed.fontSize) || options.max || 16;
  const max = options.max ?? startingSize;

  if (lineBreak) {
    element.style.whiteSpace = "normal";
    element.style.overflowWrap = "break-word";
    element.style.hyphens = "auto";

    if (lineBreak === "balance") {
      element.style.textWrap = "balance";
    }
  }

  if (nowrap) {
    element.style.whiteSpace = "nowrap";
  }

  let size = max;
  element.style.fontSize = `${size}px`;

  while (size > min && overflows(element, tolerance, fitParent)) {
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
