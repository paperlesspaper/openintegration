import type { FitToScreenOptions } from "./types";

type FitToScreenState = {
  frame: number;
  options: FitToScreenOptions;
  update: () => void;
  removeListeners: () => void;
};

type FitImageState = {
  frame: number;
  mode: "contain" | "cover";
  update: () => void;
  removeListeners: () => void;
};

const fitToScreenStates = new WeakMap<HTMLElement, FitToScreenState>();
const fitImageStates = new WeakMap<HTMLImageElement, FitImageState>();

function getTarget(element?: HTMLElement): HTMLElement | undefined {
  return element ?? globalThis.document?.body;
}

function requestFrame(callback: FrameRequestCallback): number {
  if (typeof window.requestAnimationFrame === "function") {
    return window.requestAnimationFrame(callback);
  }

  return window.setTimeout(() => callback(window.performance.now()), 0);
}

function onScreenResize(callback: () => void): () => void {
  window.addEventListener("resize", callback);
  window.addEventListener("orientationchange", callback);
  window.visualViewport?.addEventListener("resize", callback);

  return () => {
    window.removeEventListener("resize", callback);
    window.removeEventListener("orientationchange", callback);
    window.visualViewport?.removeEventListener("resize", callback);
  };
}

function scheduleFrame(state: { frame: number; update: () => void }): void {
  if (state.frame) {
    return;
  }

  state.frame = requestFrame(() => {
    state.frame = 0;
    state.update();
  });
}

function applyFitToScreen(target: HTMLElement, options: FitToScreenOptions): number {
  const { padding = 0, maxScale = 1 } = options;

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

function observeFitToScreen(target: HTMLElement, options: FitToScreenOptions): FitToScreenState {
  const state: FitToScreenState = {
    frame: 0,
    options,
    update: () => {
      if (!target.isConnected && target !== globalThis.document?.body) {
        state.removeListeners();
        fitToScreenStates.delete(target);
        return;
      }

      applyFitToScreen(target, state.options);
    },
    removeListeners: () => undefined
  };
  const schedule = () => scheduleFrame(state);

  state.removeListeners = onScreenResize(schedule);
  fitToScreenStates.set(target, state);

  return state;
}

export function fitToScreen(
  element?: HTMLElement,
  options: FitToScreenOptions = {}
): number {
  const target = getTarget(element);

  if (typeof window === "undefined" || !target) {
    return 1;
  }

  const state = fitToScreenStates.get(target) ?? observeFitToScreen(target, options);
  state.options = options;

  return applyFitToScreen(target, options);
}

function applyFitImage(image: HTMLImageElement, mode: "contain" | "cover"): void {
  image.style.width = "100%";
  image.style.height = "100%";
  image.style.objectFit = mode;
}

function observeFitImage(image: HTMLImageElement, mode: "contain" | "cover"): FitImageState {
  const state: FitImageState = {
    frame: 0,
    mode,
    update: () => {
      if (!image.isConnected) {
        state.removeListeners();
        fitImageStates.delete(image);
        return;
      }

      applyFitImage(image, state.mode);
    },
    removeListeners: () => undefined
  };
  const schedule = () => scheduleFrame(state);

  state.removeListeners = onScreenResize(schedule);
  fitImageStates.set(image, state);

  return state;
}

export function fitImage(image: HTMLImageElement, mode: "contain" | "cover" = "contain"): void {
  if (typeof window !== "undefined") {
    const state = fitImageStates.get(image) ?? observeFitImage(image, mode);
    state.mode = mode;
  }

  applyFitImage(image, mode);
}
