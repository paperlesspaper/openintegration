import { escapeHtml } from "./html";

export type OfTheDayTextSize = "small" | "middle" | "big";
export type OfTheDayLayoutMode = "auto" | "default" | "facts-left-landscape";

export interface OfTheDayFact {
  label: unknown;
  value?: unknown;
  visible?: boolean;
  className?: string;
}
export interface OfTheDayMetaItem {
  label?: unknown;
  value?: unknown;
  visible?: boolean;
  key?: string;
  className?: string;
}
export interface OfTheDayImageOptions {
  src?: string;
  alt?: string;
  fit?: "contain" | "cover";
  position?: string;
  blendMode?: string;
  className?: string;
}
export interface RenderOfTheDayLayoutOptions {
  target?: HTMLElement | string;
  className?: string;
  layout?: OfTheDayLayoutMode;
  textSize?: OfTheDayTextSize | string;
  showHeader?: boolean;
  /** Opt in to the count when selected facts do not all fit. Defaults to false. */
  showFactCount?: boolean;
  kicker?: unknown;
  title: unknown;
  subtitle?: unknown;
  signature?: unknown;
  image?: OfTheDayImageOptions;
  facts?: OfTheDayFact[];
  meta?: OfTheDayMetaItem[];
  emptyValue?: string;
  /** Localized template. Requires showFactCount and an incomplete fact selection. */
  factsShown?: string;
  customProperties?: Record<string, string | number | undefined>;
}
export interface OfTheDayLayoutElements {
  target: HTMLElement;
  shell: HTMLElement;
  header: HTMLElement | null;
  title: HTMLElement | null;
  signature: HTMLElement | null;
  subtitle: HTMLElement | null;
  imageStage: HTMLElement;
  image: HTMLImageElement;
  factGrid: HTMLElement;
  facts: HTMLElement[];
  meta: HTMLElement[];
}
export interface FitOfTheDayLayoutOptions {
  textSize?: OfTheDayTextSize | string;
  titleMin?: number;
  titleMax?: number;
  signatureMin?: number;
  signatureMax?: number;
  /** Kept for compatibility; this layout no longer scales the whole screen. */
  fitScreen?: boolean;
  screenPadding?: number;
}
export interface OfTheDayFitReport {
  selectedFacts: number;
  visibleFacts: number;
  layout: "side" | "stack";
  hasOverflow: boolean;
}

type LayoutState = {
  mode: OfTheDayLayoutMode;
  options: FitOfTheDayLayoutOptions;
  textSize: OfTheDayTextSize;
  factsShown: string;
  showFactCount: boolean;
  frame?: number;
  removeListeners?: () => void;
};
const states = new WeakMap<HTMLElement, LayoutState>();
const textSizes: OfTheDayTextSize[] = ["small", "middle", "big"];
const layoutClasses = ["auto", "default", "facts-left-landscape", "side", "stack", "hide-header", "no-facts", "text-small", "text-middle", "text-big"].map(value => `pp-otd--${value}`);

function normalizeTextSize(value: unknown): OfTheDayTextSize {
  const size = String(value || "middle").toLowerCase() as OfTheDayTextSize;
  return textSizes.includes(size) ? size : "middle";
}
function resolveTarget(target?: HTMLElement | string): HTMLElement {
  if (target instanceof HTMLElement) return target;
  const element = document.querySelector<HTMLElement>(target || "#app");
  if (!element) throw new Error(`Could not find of-the-day target: ${target || "#app"}`);
  return element;
}
function hasText(value: unknown): boolean {
  return String(value ?? "").trim().length > 0;
}
function renderMeta(item: OfTheDayMetaItem): string {
  return `<span class="pp-otd-meta-item ${escapeHtml(item.className || "")}" data-key="${escapeHtml(item.key || "")}">${hasText(item.label) ? `<span class="pp-otd-meta-label">${escapeHtml(item.label)}: </span>` : ""}<span class="pp-otd-meta-value">${escapeHtml(item.value)}</span></span>`;
}

export function renderOfTheDayLayout(options: RenderOfTheDayLayoutOptions): OfTheDayLayoutElements {
  const target = resolveTarget(options.target);
  const previous = states.get(target);
  previous?.removeListeners?.();
  if (previous?.frame) cancelAnimationFrame(previous.frame);
  const textSize = normalizeTextSize(options.textSize);
  const mode = options.layout || "auto";
  const facts = (options.facts || []).filter(item => item.visible !== false);
  const meta = (options.meta || []).filter(item => item.visible !== false && hasText(item.value));
  const date = meta.filter(item => item.key === "date");
  const source = meta.filter(item => item.key !== "date");
  const image = options.image || {};

  target.classList.add("pp-screen", "pp-otd-screen");
  target.classList.remove(...layoutClasses);
  target.classList.add(`pp-otd--${mode}`, `pp-otd--text-${textSize}`);
  target.classList.toggle("pp-otd--hide-header", options.showHeader === false);
  target.classList.toggle("pp-otd--no-facts", facts.length === 0);
  if (options.className) target.classList.add(...options.className.split(/\s+/).filter(Boolean));
  target.style.transform = "";
  for (const [key, value] of Object.entries(options.customProperties || {})) {
    if (value !== undefined) target.style.setProperty(key.startsWith("--") ? key : `--${key}`, String(value));
  }
  target.innerHTML = `
    <section class="pp-otd-shell">
      <header class="pp-otd-header">
        <div class="pp-otd-topline">
          <p class="pp-otd-kicker">${escapeHtml(options.kicker || "")}</p>
          <div class="pp-otd-date">${date.map(renderMeta).join("")}</div>
        </div>
        <div class="pp-otd-title-area">
          <h1 class="pp-otd-title pp-fit">${escapeHtml(options.title)}</h1>
          ${hasText(options.subtitle) ? `<p class="pp-otd-subtitle">${escapeHtml(options.subtitle)}</p>` : ""}
        </div>
        ${hasText(options.signature) ? `<p class="pp-otd-signature">${escapeHtml(options.signature)}</p>` : ""}
      </header>
      <div class="pp-otd-image-stage"><img class="pp-otd-image ${escapeHtml(image.className || "")}" src="${escapeHtml(image.src || "")}" alt="${escapeHtml(image.alt || "")}" /></div>
      <section class="pp-otd-fact-grid" data-count="${facts.length}">
        ${facts.map(fact => `<article class="pp-otd-fact ${escapeHtml(fact.className || "")}"><p class="pp-otd-label">${escapeHtml(fact.label)}</p><p class="pp-otd-value">${escapeHtml(hasText(fact.value) ? fact.value : options.emptyValue ?? "N/A")}</p></article>`).join("")}
      </section>
      <footer class="pp-otd-footer"><div class="pp-otd-meta">${source.map(renderMeta).join("")}</div><p class="pp-otd-facts-shown" hidden></p></footer>
    </section>`;
  const renderedImage = target.querySelector<HTMLImageElement>(".pp-otd-image")!;
  renderedImage.style.objectFit = image.fit || "contain";
  renderedImage.style.objectPosition = image.position || "center";
  if (image.blendMode) renderedImage.style.mixBlendMode = image.blendMode;
  states.set(target, { mode, textSize, options: {}, showFactCount: options.showFactCount === true, factsShown: options.factsShown || "{shown} of {total} facts" });
  return {
    target,
    shell: target.querySelector<HTMLElement>(".pp-otd-shell")!,
    header: target.querySelector<HTMLElement>(".pp-otd-header"),
    title: target.querySelector<HTMLElement>(".pp-otd-title"),
    signature: target.querySelector<HTMLElement>(".pp-otd-signature"),
    subtitle: target.querySelector<HTMLElement>(".pp-otd-subtitle"),
    imageStage: target.querySelector<HTMLElement>(".pp-otd-image-stage")!,
    image: renderedImage,
    factGrid: target.querySelector<HTMLElement>(".pp-otd-fact-grid")!,
    facts: Array.from(target.querySelectorAll<HTMLElement>(".pp-otd-fact")),
    meta: Array.from(target.querySelectorAll<HTMLElement>(".pp-otd-meta-item"))
  };
}

function fitLayout(root: HTMLElement, state: LayoutState): OfTheDayFitReport {
  const width = root.clientWidth || window.innerWidth;
  const height = root.clientHeight || window.innerHeight;
  const landscape = width > height;
  const unit = landscape ? Math.min(width / 800, height / 480) : Math.min(width / 480, height / 800);
  const scale = Math.max(0.5, unit);
  const multiplier = { small: 0.9, middle: 1, big: 1.18 }[state.textSize];
  const image = root.querySelector<HTMLImageElement>(".pp-otd-image")!;
  const side = landscape && (state.mode === "facts-left-landscape" || (state.mode === "auto" && image.naturalWidth / image.naturalHeight < 1.25));
  const facts = Array.from(root.querySelectorAll<HTMLElement>(".pp-otd-fact"));
  const grid = root.querySelector<HTMLElement>(".pp-otd-fact-grid")!;
  const stage = root.querySelector<HTMLElement>(".pp-otd-image-stage")!;
  const summary = root.querySelector<HTMLElement>(".pp-otd-facts-shown")!;
  const title = root.querySelector<HTMLElement>(".pp-otd-title")!;
  const signature = root.querySelector<HTMLElement>(".pp-otd-signature");
  root.classList.toggle("pp-otd--side", side);
  root.classList.toggle("pp-otd--stack", !side);
  root.style.setProperty("--pp-otd-unit", `${scale}px`);
  root.style.setProperty("--pp-otd-text-scale", String(multiplier));
  root.style.setProperty("--pp-otd-extra-padding", `${Math.max(0, state.options.screenPadding || 0)}px`);
  title.style.fontSize = state.options.titleMax ? `${state.options.titleMax}px` : "";
  if (signature) {
    signature.style.fontSize = state.options.signatureMax ? `${state.options.signatureMax}px` : "";
    if (state.options.signatureMin) {
      signature.style.fontSize = `${Math.max(state.options.signatureMin, parseFloat(getComputedStyle(signature).fontSize))}px`;
    }
  }

  // Titles get a bounded two-line budget; fit width/line count, never glyph ink against a 0.9 line box.
  const titleSize = parseFloat(getComputedStyle(title).fontSize);
  const titleMin = Math.min(titleSize, state.options.titleMin ?? 24 * scale * multiplier);
  for (let size = titleSize; size >= titleMin; size -= scale) {
    title.style.fontSize = `${Math.max(titleMin, size)}px`;
    const style = getComputedStyle(title);
    if (title.scrollWidth <= title.clientWidth + 2 && title.clientHeight <= parseFloat(style.lineHeight) * 2 + 2) break;
  }

  // A smaller number of complete facts is preferable to tiny type or a cropped subject.
  // All selected facts stay in the DOM and are restored on every refit / viewport update.
  const imageFloor = side ? 0 : height * (landscape ? 0.46 : 0.43);
  let shown = facts.length;
  const update = (count: number, columns: number) => {
    facts.forEach((fact, index) => {
      fact.hidden = index >= count;
      fact.style.gridColumn = index === count - 1 && count % columns === 1 && columns > 1 ? "1 / -1" : "";
    });
    root.classList.toggle("pp-otd--no-facts", count === 0);
    grid.dataset.visibleCount = String(count);
    grid.style.setProperty("--pp-otd-columns", String(columns));
    summary.hidden = !state.showFactCount || count === facts.length;
    summary.textContent = !summary.hidden ? state.factsShown.replace(/\{shown\}/g, String(count)).replace(/\{total\}/g, String(facts.length)) : "";
  };
  const fits = () => {
    const bounds = root.getBoundingClientRect();
    if (stage.clientHeight < imageFloor || stage.clientWidth < 1) return false;
    return Array.from(root.querySelectorAll<HTMLElement>(".pp-otd-header, .pp-otd-header *, .pp-otd-fact-grid, .pp-otd-fact:not([hidden]), .pp-otd-fact:not([hidden]) > *, .pp-otd-footer, .pp-otd-footer *")).every(element => {
      if (!element.getClientRects().length) return true;
      const rect = element.getBoundingClientRect();
      return element.scrollHeight <= element.clientHeight + 2 && element.scrollWidth <= element.clientWidth + 2 && rect.bottom <= bounds.bottom + 1 && rect.right <= bounds.right + 1;
    });
  };
  let valid = false;
  // Try alternative fact columns before omitting anything. Full-width long final facts do not leave an empty slot.
  const columnChoices = side || !landscape ? [2, 3] : [Math.min(5, Math.max(1, shown)), 4, 3];
  for (; shown >= 0; shown--) {
    for (const columns of [...new Set(columnChoices)].filter(count => count <= Math.max(1, shown))) {
      update(shown, columns);
      if (fits()) { valid = true; break; }
    }
    if (valid) break;
    // Zero and one selected fact also need a candidate.
    if (shown <= 1) { update(shown, 1); if (fits()) { valid = true; break; } }
  }
  shown = Math.max(0, shown);
  root.dataset.visibleFacts = String(shown);
  root.dataset.selectedFacts = String(facts.length);
  root.dataset.layoutOverflow = String(!valid);
  return { selectedFacts: facts.length, visibleFacts: shown, layout: side ? "side" : "stack", hasOverflow: !valid };
}

export function fitOfTheDayLayout(layout: OfTheDayLayoutElements | HTMLElement | string, options: FitOfTheDayLayoutOptions = {}): OfTheDayFitReport {
  const root = typeof layout === "string" || layout instanceof HTMLElement ? resolveTarget(layout) : layout.target;
  const state = states.get(root);
  if (!state) throw new Error("Render the of-the-day layout before fitting it.");
  state.options = options;
  state.textSize = normalizeTextSize(options.textSize || state.textSize);
  if (!state.removeListeners) {
    const update = () => {
      if (state.frame) cancelAnimationFrame(state.frame);
      state.frame = requestAnimationFrame(() => {
        state.frame = undefined;
        if (root.isConnected) fitLayout(root, state);
        else { state.removeListeners?.(); state.removeListeners = undefined; }
      });
    };
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    state.removeListeners = () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }
  return fitLayout(root, state);
}

export async function waitForOfTheDayImage(layoutOrImage: OfTheDayLayoutElements | HTMLImageElement): Promise<void> {
  const image = layoutOrImage instanceof HTMLImageElement ? layoutOrImage : layoutOrImage.image;
  if (image.complete) {
    if (image.naturalWidth > 0) { await image.decode?.(); return; }
    throw new Error("Image could not load.");
  }
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => { image.removeEventListener("load", loaded); image.removeEventListener("error", failed); };
    const loaded = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error("Image could not load.")); };
    image.addEventListener("load", loaded, { once: true });
    image.addEventListener("error", failed, { once: true });
  });
  await image.decode?.();
}
