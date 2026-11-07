import type { JsonRecord } from "./types";

export interface EmbeddedContext {
  renderId: string;
  regionId: string;
  parentOrigin: string;
}
export function embeddedContext(): EmbeddedContext | undefined {
  if (
    typeof window === "undefined" ||
    window.parent === window ||
    !window.name.startsWith("paperless-slot:")
  )
    return;
  try {
    const value = JSON.parse(window.name.slice("paperless-slot:".length));
    if (
      typeof value.renderId === "string" &&
      typeof value.regionId === "string" &&
      typeof value.parentOrigin === "string" &&
      /^https?:\/\//.test(value.parentOrigin)
    )
      return value;
  } catch {
    /* Not an embedded render. */
  }
}
export function postEmbeddedStatus(
  status: "loading" | "ready" | "error",
  error?: string
): void {
  const context = embeddedContext();
  if (!context) return;
  const processing = document
    .querySelector('meta[name="paperless:epd-optimize"]')
    ?.getAttribute("content");
  window.parent.postMessage(
    { type: "PAPERLESS_RENDER_STATUS", ...context, status, error, processing },
    context.parentOrigin
  );
}
export function announceEmbeddedListener(): void {
  const context = embeddedContext();
  if (context)
    window.parent.postMessage(
      { type: "PAPERLESS_RENDER_HELLO", ...context },
      context.parentOrigin
    );
}
export function acceptsEmbeddedInit(event: MessageEvent): boolean {
  const context = embeddedContext();
  if (!context) return true;
  const message = event.data as JsonRecord | undefined;
  return (
    event.source === window.parent &&
    event.origin === context.parentOrigin &&
    message?.type === "INIT" &&
    message.renderId === context.renderId &&
    message.regionId === context.regionId
  );
}
