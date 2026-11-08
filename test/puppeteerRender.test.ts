import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseEpdOptimizeMetaContent, renderUrlWithPuppeteer } from "../src/puppeteerRender";

const puppeteerMocks = vi.hoisted(() => {
  const page = {
    close: vi.fn(),
    emulateTimezone: vi.fn(),
    goto: vi.fn(),
    screenshot: vi.fn(async () => Buffer.from("png")),
    setViewport: vi.fn(),
    waitForNetworkIdle: vi.fn(async () => undefined),
    waitForSelector: vi.fn()
  };
  const browser = {
    close: vi.fn(),
    newPage: vi.fn(async () => page)
  };

  return {
    browser,
    launch: vi.fn(async () => browser),
    page
  };
});

vi.mock("puppeteer-core", () => ({
  launch: puppeteerMocks.launch
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Puppeteer timezone", () => {
  it("emulates the configured timezone before navigation", async () => {
    await renderUrlWithPuppeteer({
      height: 480,
      optimize: false,
      timezone: "Europe/Berlin",
      url: "https://integration.test/render.html",
      width: 800
    });

    expect(puppeteerMocks.page.emulateTimezone).toHaveBeenCalledWith("Europe/Berlin");
    expect(puppeteerMocks.page.emulateTimezone.mock.invocationCallOrder[0]).toBeLessThan(
      puppeteerMocks.page.goto.mock.invocationCallOrder[0]
    );
  });
});

describe("Puppeteer EPD optimize meta settings", () => {
  it("reads JSON meta settings", () => {
    expect(parseEpdOptimizeMetaContent('{"enabled":true,"intent":"vivid"}')).toEqual({
      enabled: true,
      intent: "vivid"
    });
  });

  it("supports disabling optimization from the page", () => {
    expect(parseEpdOptimizeMetaContent('{"enabled":false,"intent":"lowNoise"}')).toEqual({
      enabled: false,
      intent: "lowNoise"
    });
  });

  it("supports intent shorthand", () => {
    expect(parseEpdOptimizeMetaContent("faithful")).toEqual({
      intent: "faithful"
    });
  });

  it("reads palette and epdoptimize option groups", () => {
    expect(
      parseEpdOptimizeMetaContent(
        '{"intent":"dynamic","palette":"spectra6OriginalPalette","canvasDitherOptions":{"ditheringType":"quantizationOnly"},"imageAdjustmentOptions":{"toneMapping":{"mode":"scurve"}}}'
      )
    ).toEqual({
      options: {
        ditheringType: "quantizationOnly",
        toneMapping: {
          mode: "scurve"
        }
      },
      paletteName: "spectra6OriginalPalette"
    });
  });

  it("ignores invalid or unsupported settings", () => {
    expect(parseEpdOptimizeMetaContent("")).toBeUndefined();
    expect(parseEpdOptimizeMetaContent("{nope")).toBeUndefined();
    expect(parseEpdOptimizeMetaContent('{"intent":"extra-crunchy"}')).toBeUndefined();
  });
});
