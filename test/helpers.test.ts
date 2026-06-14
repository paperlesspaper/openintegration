import { describe, expect, it, vi } from "vitest";
import {
  applyColorTheme,
  applyColorThemeFromQuery,
  detectOverflow,
  escapeHtml,
  fitAllText,
  fitHyphenatedText,
  fitImage,
  fitText,
  fitToScreen,
  getQuerySettings,
  getSettings,
  hyphenateText,
  markError,
  markLoading,
  markReady,
  mergeSettings,
  stripSoftHyphens,
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

  it("waitForPayload supports the timeout alias", async () => {
    resetDom();

    await expect(waitForPayload({ timeout: 1, fallback: { ok: true } })).resolves.toEqual({
      ok: true
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

describe("theme helpers", () => {
  it("applyColorTheme applies a supported class", () => {
    resetDom();

    expect(applyColorTheme("blue-light")).toBe("blue-light");
    expect(document.body.className).toBe("blue-light");
  });

  it("applyColorTheme replaces prior theme classes and falls back", () => {
    resetDom();
    document.body.classList.add("red", "custom-class");

    expect(applyColorTheme("unknown", { defaultTheme: "light" })).toBe("light");
    expect(document.body.classList.contains("red")).toBe(false);
    expect(document.body.classList.contains("custom-class")).toBe(true);
    expect(document.body.classList.contains("light")).toBe(true);
  });

  it("applyColorTheme normalizes six-color names to color themes", () => {
    resetDom();

    expect(applyColorTheme("green")).toBe("green-light");
    expect(document.body.classList.contains("green")).toBe(false);
    expect(document.body.classList.contains("green-light")).toBe(true);
  });

  it("applyColorThemeFromQuery reads the color parameter", () => {
    resetDom("https://example.test/render.html?color=green-dark");

    expect(applyColorThemeFromQuery()).toBe("green-dark");
    expect(document.body.classList.contains("green-dark")).toBe(true);
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

  it("fitText can grow toward max when there is room", () => {
    resetDom();
    const element = document.createElement("div");
    element.textContent = "Title";
    element.style.fontSize = "12px";
    document.body.append(element);

    fitText(element, { max: 20, step: 4 });

    expect(element.style.fontSize).toBe("20px");
  });

  it("fitText can enable balanced line breaks", () => {
    resetDom();
    const element = document.createElement("div");
    element.textContent = "A long title with several words";
    document.body.append(element);

    fitText(element, { lineBreak: "balance" });

    expect(element.style.whiteSpace).toBe("normal");
    expect(element.style.overflowWrap).toBe("break-word");
    expect(element.style.hyphens).toBe("auto");
    expect(element.style.textWrap).toBe("balance");
  });

  it("fitText can use the parent as the overflow target", () => {
    resetDom();
    const parent = document.createElement("div");
    const element = document.createElement("div");
    element.textContent = "Parent bounded";
    element.style.fontSize = "12px";
    parent.append(element);
    document.body.append(parent);

    expect(() => fitText(element, { fitParent: true, max: 24 })).not.toThrow();
    expect(element.style.fontSize).toBe("24px");
  });

  it("fitAllText does not throw", () => {
    resetDom();
    const element = document.createElement("div");
    element.className = "pp-fit";
    document.body.append(element);

    expect(() => fitAllText()).not.toThrow();
  });

  it("hyphenateText inserts soft hyphens in long words", () => {
    const text = hyphenateText("difference");

    expect(text).toContain("\u00AD");
    expect(stripSoftHyphens(text)).toBe("difference");
  });

  it("fitHyphenatedText prepares manual hyphenation and fits text", () => {
    resetDom();
    const element = document.createElement("p");
    element.textContent = "A surprisinglylongword";
    document.body.append(element);

    fitHyphenatedText(element, { max: 40 });

    expect(element.textContent).toContain("\u00AD");
    expect(element.style.hyphens).toBe("manual");
    expect(element.style.whiteSpace).toBe("normal");
    expect(element.style.fontSize).toBe("40px");
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
