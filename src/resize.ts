import type { FitToScreenOptions } from "./types";

export function fitToScreen(
  element?: HTMLElement,
  options: FitToScreenOptions = {}
): number {
  const { padding = 0, maxScale = 1 } = options;

  const target = element ?? globalThis.document?.body;

  if (typeof window === "undefined" || !target) {
    return 1;
  }

  target.style.transform = "";
  target.style.transformOrigin = "top left";

  const rect = target.getBoundingClientRect();
  const width = rect.width || target.scrollWidth;
  const height = rect.height || target.scrollHeight;
  const availableWidth = Math.max(0, window.innerWidth - padding * 2);
  const availableHeight = Math.max(0, window.innerHeight - padding * 2);

  if (!width || !height || !availableWidth || !availableHeight) {
    return 1;
  }

  const scale = Math.min(maxScale, availableWidth / width, availableHeight / height);
  target.style.transform = `scale(${scale})`;

  return scale;
}

export function fitImage(image: HTMLImageElement, mode: "contain" | "cover" = "contain"): void {
  image.style.width = "100%";
  image.style.height = "100%";
  image.style.objectFit = mode;
}
