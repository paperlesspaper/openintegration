import { markError, markLoading, markReady } from "./ready";
import { waitForPayload } from "./runtime";
import { applyColorTheme } from "./theme";
import type { JsonRecord } from "./types";

export interface LayoutRegion {
  id: string;
  type: "image" | "integration";
  url: string;
  payload?: JsonRecord;
  processing?: "inherit" | "photo" | "readable" | "quantization";
  fit?: "cover" | "contain";
  focalX?: number;
  focalY?: number;
}
export interface LayoutPayload {
  renderId: string;
  layout: "columns" | "rows" | "grid" | "custom";
  regions: LayoutRegion[];
  ratio?: number;
  gap?: number;
  html?: string;
  css?: string;
  color?: string;
}

const tags = new Set([
  "DIV",
  "SECTION",
  "MAIN",
  "HEADER",
  "FOOTER",
  "ASIDE",
  "ARTICLE",
  "P",
  "SPAN",
  "H1",
  "H2",
  "H3",
  "H4",
  "STRONG",
  "EM",
  "SMALL",
  "BR",
  "HR",
  "UL",
  "OL",
  "LI",
  "STYLE",
  "PAPERLESS-SLOT",
]);
function safeCss(css: string): string {
  // No external resources or CSS escapes; HTML layouts are presentation-only.
  if (
    css.length > 32_000 ||
    /url\s*\(|@import|@font-face|image-set\s*\(|expression\s*\(|\\|\/\*/i.test(
      css
    )
  )
    throw new Error(
      "Layout CSS must not load external resources or use escapes/comments."
    );
  return css;
}
export function sanitizeLayoutHtml(html: string): string {
  if (html.length > 32_000) throw new Error("Layout HTML is too large.");
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const element of [...doc.querySelectorAll("*")]) {
    if (["HTML", "HEAD", "BODY"].includes(element.tagName)) continue;
    if (!tags.has(element.tagName))
      throw new Error(
        `Layout HTML does not support <${element.tagName.toLowerCase()}>.`
      );
    for (const attribute of [...element.attributes]) {
      if (
        !["class", "id", "name", "style", "aria-label"].includes(attribute.name)
      )
        throw new Error(`Layout HTML does not support ${attribute.name}.`);
      if (attribute.name === "style") safeCss(attribute.value);
    }
    if (element.tagName === "STYLE") safeCss(element.textContent || "");
  }
  return doc.head.innerHTML + doc.body.innerHTML;
}

export function validateLayoutRects(
  rects: Array<{ x: number; y: number; width: number; height: number }>,
  width: number,
  height: number
): void {
  if (rects.length < 2 || rects.length > 4)
    throw new Error("A layout needs two to four slots.");
  rects.forEach((rect, index) => {
    if (
      ![rect.x, rect.y, rect.width, rect.height].every(Number.isInteger) ||
      rect.width < 16 ||
      rect.height < 16 ||
      rect.x < 0 ||
      rect.y < 0 ||
      rect.x + rect.width > width ||
      rect.y + rect.height > height
    )
      throw new Error(
        "Every slot must fit inside the display and be at least 16 × 16 pixels."
      );
    for (const other of rects.slice(0, index)) {
      if (
        rect.x < other.x + other.width &&
        rect.x + rect.width > other.x &&
        rect.y < other.y + other.height &&
        rect.y + rect.height > other.y
      )
        throw new Error("Layout slots must not overlap.");
    }
  });
}

function processingSettings(
  profile: LayoutRegion["processing"],
  inherited?: string | null
): string {
  if (profile === "photo")
    return JSON.stringify({
      intent: "natural",
      options: { ditheringType: "errorDiffusion" },
    });
  if (profile === "readable") return JSON.stringify({ intent: "readable" });
  if (profile === "quantization")
    return JSON.stringify({
      intent: "readable",
      options: { ditheringType: "quantizationOnly" },
    });
  return inherited || JSON.stringify({ intent: "readable" });
}

/** One fresh iframe per slot and render generation prevents late results from previous INITs. */
export async function renderLayout(
  target: HTMLElement,
  config: LayoutPayload,
  signal: AbortSignal
): Promise<void> {
  if (
    !config ||
    !Array.isArray(config.regions) ||
    config.regions.length < 2 ||
    config.regions.length > 4 ||
    !config.renderId
  )
    throw new Error("Select two to four contents for this layout.");
  const ids = config.regions.map((region) => region.id);
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id) => !/^[a-z][a-z0-9-]{0,31}$/.test(id))
  )
    throw new Error(
      "Slot names must be unique and use letters, numbers or hyphens."
    );
  const shadow = target.shadowRoot || target.attachShadow({ mode: "open" });
  const gap = Math.max(0, Math.min(64, Number(config.gap) || 0));
  const ratio = Math.max(0.25, Math.min(4, Number(config.ratio) || 1));
  const columns =
    config.layout === "rows"
      ? "1fr"
      : config.layout === "grid"
        ? "1fr 1fr"
        : `${ratio}fr ${config.regions
            .slice(1)
            .map(() => "1fr")
            .join(" ")}`;
  const rows =
    config.layout === "rows"
      ? `${ratio}fr ${config.regions
          .slice(1)
          .map(() => "1fr")
          .join(" ")}`
      : config.layout === "grid" && config.regions.length > 2
        ? "1fr 1fr"
        : "1fr";
  shadow.innerHTML =
    `<style>
    :host { display:block; width:100%; height:100%; }
    * { box-sizing:border-box; animation:none!important; transition:none!important; }
    .paperless-layout { display:grid; width:100%; height:100%; grid-template-columns:${columns}; grid-template-rows:${rows}; gap:${gap}px; }
    paperless-slot { display:block; min-width:0; min-height:0; overflow:hidden; }
    paperless-slot > iframe, paperless-slot > img { display:block; border:0; width:100%; height:100%; }
  </style>` +
    (config.layout === "custom"
      ? sanitizeLayoutHtml(config.html || "")
      : `<div class="paperless-layout">${ids
          .map((id) => `<paperless-slot name="${id}"></paperless-slot>`)
          .join("")}</div>`);
  if (config.layout === "custom") {
    const customStyle = document.createElement("style");
    customStyle.textContent = safeCss(config.css || "");
    shadow.append(customStyle);
  }
  const slots = [...shadow.querySelectorAll<HTMLElement>("paperless-slot")];
  if (
    slots.length !== ids.length ||
    slots.some((slot) => !ids.includes(slot.getAttribute("name") || "")) ||
    new Set(slots.map((slot) => slot.getAttribute("name"))).size !== ids.length
  )
    throw new Error(
      "Custom HTML must contain exactly one paperless-slot for each configured slot name."
    );
  const inherited = new Map<string, string | null>();
  const timeout = setTimeout(
    () =>
      cancel(
        new Error("Layout contents did not finish loading within 12 seconds.")
      ),
    12_000
  );
  let rejectWait: (reason: unknown) => void = () => {};
  const canceled = new Promise<never>((_, reject) => {
    rejectWait = reject;
  });
  function cancel(error: Error) {
    rejectWait(error);
  }
  const abort = () => cancel(new DOMException("Layout replaced", "AbortError"));
  signal.addEventListener("abort", abort, { once: true });
  const cleanups: Array<() => void> = [];
  try {
    if (signal.aborted) throw new DOMException("Layout replaced", "AbortError");
    const tasks = config.regions.map(async (region) => {
      const slot = slots.find(
        (slot) => slot.getAttribute("name") === region.id
      )!;
      const url = new URL(region.url, location.href);
      if (
        !["https:", "http:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new Error("Invalid content URL.");
      if (region.type === "image") {
        const img = document.createElement("img");
        img.alt = "";
        img.style.objectFit = region.fit === "contain" ? "contain" : "cover";
        img.style.objectPosition = `${Math.max(
          0,
          Math.min(100, region.focalX ?? 50)
        )}% ${Math.max(0, Math.min(100, region.focalY ?? 50))}%`;
        img.src = url.href;
        slot.replaceChildren(img);
        await img.decode();
        if (!img.naturalWidth)
          throw new Error(`Image in ${region.id} could not be loaded.`);
        inherited.set(region.id, JSON.stringify({ intent: "natural" }));
        return;
      }
      await new Promise<void>((resolve, reject) => {
        const frame = document.createElement("iframe");
        frame.title = region.id;
        frame.referrerPolicy = "no-referrer";
        frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
        frame.name =
          "paperless-slot:" +
          JSON.stringify({
            renderId: config.renderId,
            regionId: region.id,
            parentOrigin: location.origin,
          });
        let initialized = false;
        let finished = false;
        const onMessage = (event: MessageEvent) => {
          if (
            event.source !== frame.contentWindow ||
            event.origin !== url.origin
          )
            return;
          const message = event.data;
          if (
            !message ||
            message.renderId !== config.renderId ||
            message.regionId !== region.id
          )
            return;
          if (message.type === "PAPERLESS_RENDER_HELLO" && !initialized) {
            initialized = true;
            frame.contentWindow!.postMessage(
              {
                type: "INIT",
                cmd: "message",
                renderId: config.renderId,
                regionId: region.id,
                data: region.payload || {},
              },
              url.origin
            );
          }
          if (
            message.type === "PAPERLESS_RENDER_STATUS" &&
            initialized &&
            !finished
          ) {
            if (message.status === "error") {
              finished = true;
              reject(new Error(`Content ${region.id} could not be rendered.`));
            }
            if (message.status === "ready") {
              finished = true;
              inherited.set(
                region.id,
                typeof message.processing === "string"
                  ? message.processing
                  : null
              );
              resolve();
            }
          }
        };
        window.addEventListener("message", onMessage);
        cleanups.push(() => window.removeEventListener("message", onMessage));
        frame.src = url.href;
        slot.replaceChildren(frame);
      });
    });
    await Promise.race([Promise.all(tasks), canceled]);
    await document.fonts?.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
    if (signal.aborted) throw new DOMException("Layout replaced", "AbortError");
    const rects = config.regions.map((region) => {
      const slot = slots.find(
        (slot) => slot.getAttribute("name") === region.id
      )!;
      for (
        let element: HTMLElement | null = slot;
        element;
        element =
          element.parentElement ||
          (element.getRootNode() === shadow ? target : null)
      ) {
        const style = getComputedStyle(element);
        if (
          style.transform !== "none" ||
          style.clipPath !== "none" ||
          (style.maskImage && style.maskImage !== "none") ||
          style.filter !== "none" ||
          style.mixBlendMode !== "normal" ||
          Number(style.opacity) !== 1 ||
          [
            style.borderTopLeftRadius,
            style.borderTopRightRadius,
            style.borderBottomLeftRadius,
            style.borderBottomRightRadius,
          ].some((value) => parseFloat(value) !== 0)
        )
          throw new Error(
            "Slots require rectangular, opaque areas without transforms or clipping."
          );
      }
      const bounds = slot.getBoundingClientRect();
      const x = Math.round(bounds.left),
        y = Math.round(bounds.top);
      return {
        id: region.id,
        x,
        y,
        width: Math.round(bounds.right) - x,
        height: Math.round(bounds.bottom) - y,
        processing: processingSettings(
          (!region.processing || region.processing === "inherit") &&
            region.type === "image"
            ? "photo"
            : region.processing,
          inherited.get(region.id)
        ),
      };
    });
    validateLayoutRects(rects, innerWidth, innerHeight);
    let meta = document.querySelector<HTMLMetaElement>(
      'meta[name="paperless:regions"]'
    );
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "paperless:regions";
      document.head.append(meta);
    }
    meta.content = JSON.stringify(rects);
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
    cleanups.forEach((cleanup) => cleanup());
  }
}

export async function bootLayoutIntegration(
  target: HTMLElement
): Promise<void> {
  let active: AbortController | undefined;
  let hostOrigin: string | undefined;
  window.addEventListener("message", (event) => {
    if (
      event.source === window.parent &&
      event.data?.type === "INIT" &&
      event.data?.data?.layout
    )
      hostOrigin = event.origin;
  });
  const notifyHost = (payload: JsonRecord, status: string, error?: string) => {
    if (hostOrigin && window.parent !== window)
      window.parent.postMessage(
        {
          type: "PAPERLESS_LAYOUT_STATUS",
          renderId: (payload.layout as LayoutPayload)?.renderId,
          status,
          error,
        },
        hostOrigin
      );
  };
  const render = async (payload: JsonRecord) => {
    active?.abort();
    const controller = new AbortController();
    active = controller;
    markLoading();
    document.querySelector('meta[name="paperless:regions"]')?.remove();
    try {
      const config = payload.layout as unknown as LayoutPayload;
      applyColorTheme(config?.color || "blue-light");
      await renderLayout(target, config, controller.signal);
      if (!controller.signal.aborted) {
        markReady();
        notifyHost(payload, "ready");
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        markError(error);
        notifyHost(
          payload,
          "error",
          error instanceof Error ? error.message : "Layout failed"
        );
      }
    }
  };
  await render(
    await waitForPayload({
      timeoutMs: -1,
      onUpdate: render,
      source: window.parent,
    })
  );
}
