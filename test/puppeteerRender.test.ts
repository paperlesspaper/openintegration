import { describe, expect, it } from "vitest";
import { parseEpdOptimizeMetaContent } from "../src/puppeteerRender";

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

  it("ignores invalid or unsupported settings", () => {
    expect(parseEpdOptimizeMetaContent("")).toBeUndefined();
    expect(parseEpdOptimizeMetaContent("{nope")).toBeUndefined();
    expect(parseEpdOptimizeMetaContent('{"intent":"extra-crunchy"}')).toBeUndefined();
  });
});
