import { describe, expect, it } from "vitest";
import { buildPayload } from "../src/devServer";

describe("dev server payloads", () => {
  it("adds the selected color to pluginSettings", () => {
    const payload = buildPayload(
      {
        name: "Quote",
        nativeSettings: {
          index: 1
        },
        renderPage: "./render.html",
        version: "0.1.0"
      },
      "https://integration.test/config.json",
      {
        color: "red-dark",
        configPath: "config.json",
        settings: {
          color: "blue-light",
          index: 2
        }
      }
    );

    expect(payload.meta).toMatchObject({
      color: "red-dark",
      pluginSettings: {
        color: "red-dark",
        index: 2
      }
    });
  });
});
