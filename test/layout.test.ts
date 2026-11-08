import { describe, expect, it, vi, afterEach } from "vitest";
import {
  renderLayout,
  sanitizeLayoutHtml,
  validateLayoutRects,
} from "../src/layout";
import { markError, markReady } from "../src/ready";
import { waitForPayload } from "../src/runtime";
import { acceptsEmbeddedInit } from "../src/embedded";
const originalParent = window.parent;
afterEach(() => {
  vi.restoreAllMocks();
  window.name = "";
  Object.defineProperty(window, "parent", {
    configurable: true,
    value: originalParent,
  });
  document.body.innerHTML = "";
});
describe("HTML layout contract", () => {
  it("inserts CSS as text so a closing style tag cannot inject HTML", async () => {
    const target = document.createElement("main");
    document.body.append(target);
    const attack = '</style><img src="x" onerror="alert(1)">';
    await expect(
      renderLayout(
        target,
        {
          renderId: "r1",
          layout: "custom",
          html: '<paperless-slot name="a"></paperless-slot><paperless-slot name="b"></paperless-slot>',
          css: attack,
          regions: [
            { id: "a", type: "image", url: "file:///bad" },
            { id: "b", type: "image", url: "file:///bad" },
          ],
        },
        new AbortController().signal
      )
    ).rejects.toThrow("Invalid content URL");
    expect(target.shadowRoot?.querySelector("img")).toBeNull();
    expect(
      [...target.shadowRoot!.querySelectorAll("style")].some(
        (style) => style.textContent === attack
      )
    ).toBe(true);
  });

  it("preserves Grid/CSS and named slots", () => {
    expect(
      sanitizeLayoutHtml(
        '<style>.grid { display:grid; }</style><div class="grid"><paperless-slot name="photo"></paperless-slot></div>'
      )
    ).toContain('name="photo"');
  });
  it.each([
    "<script>alert(1)</script>",
    '<div onclick="alert(1)">x</div>',
    '<iframe src="https://example.com"></iframe>',
    '<style>@import "https://example.com/a.css";</style>',
    '<div style="background:url(https://example.com)"></div>',
    "<style>p {background: u\\72l(x)}</style>",
    '<svg onload="alert(1)"></svg>',
  ])("rejects active HTML/resources: %s", (html) => {
    expect(() => sanitizeLayoutHtml(html)).toThrow();
  });
  it("rejects overlap and offscreen areas", () => {
    const a = { x: 0, y: 0, width: 100, height: 100 };
    expect(() => validateLayoutRects([a, { ...a, x: 50 }], 200, 100)).toThrow(
      "overlap"
    );
    expect(() => validateLayoutRects([a, { ...a, x: 101 }], 200, 100)).toThrow(
      "inside"
    );
    expect(() =>
      validateLayoutRects([a, { ...a, x: 100 }], 200, 100)
    ).not.toThrow();
  });
});
describe("embedded lifecycle", () => {
  function embed() {
    const parent = { postMessage: vi.fn() };
    Object.defineProperty(window, "parent", {
      configurable: true,
      value: parent,
    });
    window.name =
      'paperless-slot:{"renderId":"r1","regionId":"calendar","parentOrigin":"https://host.test"}';
    return parent;
  }
  it("rejects messages when a declared embedded context is malformed", () => {
    const parent = embed();
    window.name = "paperless-slot:not-json";
    expect(acceptsEmbeddedInit(new MessageEvent("message", {
      source: parent as any, origin: "https://host.test",
      data: { type: "INIT", data: { forged: true } },
    }))).toBe(false);
  });
  it("reports errors without an intermediate successful ready message", () => {
    const parent = embed();
    vi.spyOn(console, "error").mockImplementation(() => {});
    markError(new Error("Unavailable"));
    expect(parent.postMessage).toHaveBeenCalledTimes(1);
    expect(parent.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ status: "error", renderId: "r1" }),
      "https://host.test"
    );
    expect(document.documentElement.dataset.paperlessRenderStatus).toBe(
      "error"
    );
  });
  it("does not fall back before INIT, and ignores other origins/windows/generations", async () => {
    const parent = embed();
    const done = vi.fn();
    const pending = waitForPayload({ timeoutMs: 0 }).then(done);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(done).not.toHaveBeenCalled();
    expect(parent.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "PAPERLESS_RENDER_HELLO" }),
      "https://host.test"
    );
    const data = {
      type: "INIT",
      renderId: "r1",
      regionId: "calendar",
      data: { settings: { view: "agenda" } },
    };
    for (const event of [
      { origin: "https://evil.test", source: parent, data },
      { origin: "https://host.test", source: window, data },
      {
        origin: "https://host.test",
        source: parent,
        data: { ...data, renderId: "old" },
      },
    ])
      window.dispatchEvent(
        new MessageEvent("message", event as MessageEventInit)
      );
    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://host.test",
        source: parent as any,
        data,
      })
    );
    await pending;
    expect(done).toHaveBeenCalledWith(data.data);
    markReady();
    expect(parent.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "ready" }),
      "https://host.test"
    );
  });
  it("does not treat child status notifications as new INIT payloads", async () => {
    const done = vi.fn();
    const pending = waitForPayload({ timeoutMs: -1 }).then(done);
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "PAPERLESS_RENDER_HELLO", renderId: "old" },
      })
    );
    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "INIT", data: { layout: {} } },
      })
    );
    await pending;
    expect(done).toHaveBeenCalledWith({ layout: {} });
  });
});
