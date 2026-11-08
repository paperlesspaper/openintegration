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
  getPayloadLanguage,
  getQuerySettings,
  getSettings,
  hyphenateText,
  loadLanguageJson,
  markError,
  markLoading,
  markReady,
  mergeSettings,
  renderOfTheDayLayout,
  resolveLanguage,
  stripSoftHyphens,
  validateConfig,
  waitForPayload
} from "../src";

function resetDom(url = "https://example.test/render.html"): void {
  document.body.innerHTML = "";
  window.history.replaceState({}, "", url);
}

function runAnimationFramesImmediately(): () => void {
  const originalRequestAnimationFrame = window.requestAnimationFrame;
  const originalCancelAnimationFrame = window.cancelAnimationFrame;

  Object.defineProperty(window, "requestAnimationFrame", {
    configurable: true,
    value: (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }
  });
  Object.defineProperty(window, "cancelAnimationFrame", {
    configurable: true,
    value: () => undefined
  });

  return () => {
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: originalRequestAnimationFrame
    });
    Object.defineProperty(window, "cancelAnimationFrame", {
      configurable: true,
      value: originalCancelAnimationFrame
    });
  };
}

describe("ready markers", () => {
  it("markLoading creates a loading marker", () => {
    resetDom();

    markLoading();

    expect(document.querySelector("#website-has-loading-element")).toBeTruthy();
    expect(document.documentElement.dataset.paperlessRenderStatus).toBe("loading");
  });

  it("markReady removes loading and creates loaded marker", () => {
    resetDom();
    markLoading();

    markReady();

    expect(document.querySelector("#website-has-loading-element")).toBeNull();
    expect(document.querySelector("#website-has-loaded")?.textContent).toBe("ready");
    expect(document.documentElement.dataset.paperlessRenderStatus).toBe("ready");
  });

  it("markLoading clears a stale ready marker", () => {
    resetDom();
    markReady();

    markLoading();

    expect(document.querySelector("#website-has-loaded")).toBeNull();
    expect(document.querySelector("#website-has-loading-element")).toBeTruthy();
  });

  it("markError creates a loaded marker and logs", () => {
    resetDom();
    document.body.append(document.createElement("script"));
    document.querySelector("script")!.textContent = "console.log('integration code')";
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    markError(new Error("boom"));

    expect(spy).toHaveBeenCalled();
    expect(document.querySelector("#website-has-loaded")).toBeTruthy();
    expect(document.querySelector(".pp-error")).toBeTruthy();
    expect(document.documentElement.dataset.paperlessRenderStatus).toBe("error");
    expect(document.documentElement.dataset.paperlessRenderError).toBe("boom");
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

  it("waitForPayload preserves legacy array payloads under data", async () => {
    resetDom();
    const promise = waitForPayload({ timeoutMs: 50 });

    window.postMessage(
      {
        cmd: "message",
        data: [{ summary: "Legacy event" }]
      },
      "*"
    );

    await expect(promise).resolves.toEqual({
      data: [{ summary: "Legacy event" }]
    });
  });

  it("waitForPayload can receive later INIT updates", async () => {
    resetDom();
    const updates: unknown[] = [];
    const promise = waitForPayload({
      timeoutMs: 50,
      onUpdate: (payload) => {
        updates.push(payload);
      }
    });

    window.postMessage(
      {
        type: "INIT",
        cmd: "message",
        data: {
          meta: {
            pluginSettings: {
              kind: "first"
            }
          }
        }
      },
      "*"
    );

    await expect(promise).resolves.toEqual({
      meta: {
        pluginSettings: {
          kind: "first"
        }
      }
    });

    window.postMessage(
      {
        type: "INIT",
        cmd: "message",
        data: {
          meta: {
            pluginSettings: {
              kind: "second"
            }
          }
        }
      },
      "*"
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(updates).toEqual([
      {
        meta: {
          pluginSettings: {
            kind: "second"
          }
        }
      }
    ]);
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

  it("getPayloadLanguage reads payload.meta.language", () => {
    expect(
      getPayloadLanguage({
        meta: {
          language: "de"
        }
      })
    ).toBe("de");
  });

  it("resolveLanguage supports exact, base-code, and default fallback matches", () => {
    expect(resolveLanguage({ requested: "en", supported: ["de", "en"], defaultLanguage: "de" })).toBe("en");
    expect(resolveLanguage({ requested: "de-DE", supported: ["de", "en"], defaultLanguage: "en" })).toBe("de");
    expect(resolveLanguage({ requested: "it", supported: ["de", "en"], defaultLanguage: "en" })).toBe("en");
  });

  it("loadLanguageJson resolves from the payload manifest and fetches the matching file", async () => {
    const fetchLanguage = vi.fn(async () => ({
      json: async () => ({ greeting: "Hallo" }),
      ok: true,
      status: 200
    }) as Response);

    await expect(
      loadLanguageJson(
        {
          meta: {
            language: "de-DE",
            pluginManifest: {
              language: ["de", "en"]
            }
          }
        },
        { fetch: fetchLanguage }
      )
    ).resolves.toEqual({
      language: "de",
      messages: {
        greeting: "Hallo"
      }
    });
    expect(fetchLanguage).toHaveBeenCalledWith("./languages/de.json");
  });

  it("loadLanguageJson falls back to the default language and fails on missing JSON", async () => {
    const fetchLanguage = vi.fn(async () => ({
      json: async () => ({}),
      ok: false,
      status: 404
    }) as Response);

    await expect(
      loadLanguageJson(
        {
          meta: {
            language: "fr",
            pluginManifest: {
              language: ["de", "en"]
            }
          }
        },
        { defaultLanguage: "en", fetch: fetchLanguage }
      )
    ).rejects.toThrow("Could not load language JSON for en: 404");
    expect(fetchLanguage).toHaveBeenCalledWith("./languages/en.json");
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

  it("fitToScreen updates when the screen resizes", () => {
    resetDom();
    const restoreAnimationFrame = runAnimationFramesImmediately();
    const originalWidth = window.innerWidth;
    const originalHeight = window.innerHeight;
    const element = document.createElement("main");
    document.body.append(element);
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
      bottom: 1000,
      height: 1000,
      left: 0,
      right: 1000,
      toJSON: () => ({}),
      top: 0,
      width: 1000,
      x: 0,
      y: 0
    } as DOMRect);

    Object.defineProperty(window, "innerWidth", { configurable: true, value: 500 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 500 });

    try {
      expect(fitToScreen(element)).toBe(0.5);
      expect(element.style.transform).toBe("scale(0.5)");

      Object.defineProperty(window, "innerWidth", { configurable: true, value: 250 });
      window.dispatchEvent(new Event("resize"));

      expect(element.style.transform).toBe("scale(0.25)");
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: originalHeight });
      restoreAnimationFrame();
    }
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

  it("fitImage reapplies its mode when the screen resizes", () => {
    resetDom();
    const restoreAnimationFrame = runAnimationFramesImmediately();
    const image = document.createElement("img");
    document.body.append(image);

    try {
      fitImage(image, "cover");
      image.style.objectFit = "contain";
      window.dispatchEvent(new Event("resize"));

      expect(image.style.objectFit).toBe("cover");
    } finally {
      restoreAnimationFrame();
    }
  });
});

describe("of-the-day helpers", () => {
  it("renders the shared of-the-day layout", () => {
    resetDom();
    document.body.innerHTML = '<main id="app"></main>';

    const layout = renderOfTheDayLayout({
      target: "#app",
      layout: "facts-left-landscape",
      textSize: "big",
      kicker: "Tree of the day",
      title: "Coast Redwood",
      subtitle: "Sequoia sempervirens",
      signature: "Tallest living tree species on Earth.",
      image: {
        src: "./assets/tree.png",
        alt: "Coast Redwood",
        blendMode: "multiply"
      },
      meta: [{ key: "date", value: "08 Jul" }],
      facts: [{ label: "Height", value: "115 m" }]
    });

    expect(layout.target.classList.contains("pp-otd--facts-left-landscape")).toBe(true);
    expect(layout.target.classList.contains("pp-otd--text-big")).toBe(true);
    expect(layout.title?.textContent).toBe("Coast Redwood");
    expect(layout.signature?.previousElementSibling?.className).toBe("pp-otd-title-area");
    expect(layout.factGrid.dataset.count).toBe("1");
    expect(layout.image.style.mixBlendMode).toBe("multiply");
  });

  it("does not restore fallback facts when every fact is hidden", () => {
    resetDom();
    document.body.innerHTML = '<main id="app"></main>';

    const layout = renderOfTheDayLayout({
      target: "#app",
      showHeader: false,
      title: "Hidden Facts",
      image: { src: "./assets/item.png" },
      facts: [
        { label: "Range", value: "Europe", visible: false },
        { label: "Age", value: "400 years", visible: false }
      ]
    });

    expect(layout.target.classList.contains("pp-otd--hide-header")).toBe(true);
    expect(layout.target.classList.contains("pp-otd--no-facts")).toBe(true);
    expect(layout.facts).toHaveLength(0);
    expect(layout.factGrid.dataset.count).toBe("0");
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

  it("validateConfig accepts language arrays", () => {
    expect(
      validateConfig({
        description: "Daily XKCD",
        formSchema: {},
        language: ["de", "en-US"],
        name: "xkcd",
        nativeSettings: {},
        renderPage: "render.html",
        version: "1.0.0"
      })
    ).toEqual({
      valid: true,
      errors: [],
      warnings: []
    });
  });

  it("validateConfig rejects invalid language arrays", () => {
    expect(
      validateConfig({
        description: "Daily XKCD",
        formSchema: {},
        language: ["de", "", "../en"],
        name: "xkcd",
        nativeSettings: {},
        renderPage: "render.html",
        version: "1.0.0"
      })
    ).toEqual({
      valid: false,
      errors: ["language must be an array of non-empty language codes"],
      warnings: []
    });
  });

  it("validateConfig accepts a valid IANA timezone", () => {
    expect(
      validateConfig({
        description: "Daily XKCD",
        formSchema: {},
        name: "xkcd",
        nativeSettings: {},
        renderPage: "render.html",
        timezone: "Europe/Berlin",
        version: "1.0.0"
      })
    ).toEqual({
      valid: true,
      errors: [],
      warnings: []
    });
  });

  it("validateConfig rejects an invalid timezone", () => {
    expect(
      validateConfig({
        description: "Daily XKCD",
        formSchema: {},
        name: "xkcd",
        nativeSettings: {},
        renderPage: "render.html",
        timezone: "Berlin",
        version: "1.0.0"
      })
    ).toEqual({
      valid: false,
      errors: ["timezone must be a valid IANA timezone"],
      warnings: []
    });
  });
});
