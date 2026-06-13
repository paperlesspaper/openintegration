import type { OverflowReport } from "./types";

function elementOverflows(element: HTMLElement): boolean {
  return element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight;
}

export function detectOverflow(root?: HTMLElement): OverflowReport {
  const target = root ?? globalThis.document?.body;

  if (!target) {
    return {
      hasOverflow: false,
      elements: []
    };
  }

  const elements = [target, ...Array.from(target.querySelectorAll<HTMLElement>("*"))].filter(
    elementOverflows
  );

  return {
    hasOverflow: elements.length > 0,
    elements
  };
}
