import { describe, expect, it, vi } from "vitest";
import {
  detectOverflow,
  escapeHtml,
  fitAllText,
  fitImage,
  fitText,
  fitToScreen,
  getQuerySettings,
  getSettings,
  markError,
  markLoading,
  markReady,
  mergeSettings,
  validateConfig,
  waitForPayload
} from "../src";

function resetDom(url = "https://example.test/render.html"): void {
  document.body.innerHTML = "";
  window.history.replaceState({}, "", url);
}

describe("ready markers", () => {
  it("markLoading creates a loading marker", () => {
    resetDom();

    markLoading();

    expect(document.querySelector("#website-has-loading-element")).toBeTruthy();
  });

  it("markReady removes loading and creates loaded marker", () => {
    resetDom();
    markLoading();

    markReady();

    expect(document.querySelector("#website-has-loading-element")).toBeNull();
    expect(document.querySelector("#website-has-loaded")?.textContent).toBe("ready");
  });

  it("markError creates a loaded marker and logs", () => {
    resetDom();
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    markError(new Error("boom"));

    expect(spy).toHaveBeenCalled();
    expect(document.querySelector("#website-has-loaded")).toBeTruthy();
    expect(document.querySelector(".pp-error")).toBeTruthy();
  });
});

describe("payload and settings", () => {
  it("waitForPayload returns fallback after timeout", async () => {
    resetDom();

    await expect(waitForPayload({ timeoutMs: 1, fallback: { ok: true } })).resolves.toEqual({
      ok: true
    });
  });

  it("waitForPayload accepts INIT message data", async () => {
    resetDom();
    const promise = waitForPayload({ timeoutMs: 50 });

    window.postMessage(
      {
        type: "INIT",
        cmd: "message",
        data: {
          meta: {
            pluginSettings: {
              kind: "random"
            }
          }
        }
      },
      "*"
    );

    await expect(promise).resolves.toEqual({
      meta: {
        pluginSettings: {
          kind: "random"
        }
      }
    });
  });

  it("getSettings reads payload.meta.pluginSettings", () => {
    const settings = getSettings(
      {
        meta: {
          pluginSettings: {
            kind: "random"
          }
        }
      },
      { kind: "latest", difference: 0 }
    );

    expect(settings).toEqual({ kind: "random", difference: 0 });
  });

  it("getQuerySettings parses URL params", () => {
    resetDom("https://example.test/render.html?kind=random&difference=356&debug=true");

    expect(getQuerySettings({ kind: "latest", difference: 0 })).toEqual({
      kind: "random",
      difference: 356,
      debug: true
    });
  });

  it("mergeSettings merges left-to-right", () => {
    expect(mergeSettings({ kind: "latest" }, { kind: "random" }, { difference: 1 })).toEqual({
      kind: "random",
      difference: 1
    });
  });
});

describe("layout helpers", () => {
  it("fitText does not throw", () => {
    resetDom();
    const element = document.createElement("div");
    element.textContent = "A long title";
    document.body.append(element);

    expect(() => fitText(element)).not.toThrow();
  });

  it("fitAllText does not throw", () => {
    resetDom();
    const element = document.createElement("div");
    element.className = "pp-fit";
    document.body.append(element);

    expect(() => fitAllText()).not.toThrow();
  });

  it("fitToScreen does not throw and returns a scale", () => {
    resetDom();
    const element = document.createElement("main");
    document.body.append(element);

    expect(fitToScreen(element)).toBe(1);
  });

  it("detectOverflow returns a report", () => {
    resetDom();

    expect(detectOverflow()).toEqual({
      hasOverflow: false,
      elements: []
    });
  });

  it("fitImage sets object fit", () => {
    resetDom();
    const image = document.createElement("img");

    fitImage(image, "cover");

    expect(image.style.objectFit).toBe("cover");
  });
});

describe("html and config helpers", () => {
  it("escapeHtml escapes common characters", () => {
    expect(escapeHtml("<x & y>")).toBe("&lt;x &amp; y&gt;");
  });

  it("validateConfig accepts XKCD-style config", () => {
    expect(
      validateConfig({
        name: "xkcd",
        version: "1.0.0",
        description: "Daily XKCD",
        renderPage: "render.html",
        nativeSettings: {},
        formSchema: {}
      })
    ).toEqual({
      valid: true,
      errors: [],
      warnings: []
    });
  });
});
