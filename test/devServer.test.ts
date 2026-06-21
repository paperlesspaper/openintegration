import { describe, expect, it } from "vitest";
import { buildPayload } from "../src/devServer";

describe("dev server payloads", () => {
  it("defaults color to light", () => {
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
        configPath: "config.json"
      }
    );

    expect(payload.meta).toMatchObject({
      color: "light",
      language: "de",
      pluginSettings: {
        color: "light",
        index: 1
      }
    });
  });

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

  it("uses the first declared manifest language by default", () => {
    const payload = buildPayload(
      {
        language: ["en", "de"],
        name: "Quote",
        renderPage: "./render.html",
        version: "0.1.0"
      },
      "https://integration.test/config.json",
      {
        configPath: "config.json"
      }
    );

    expect(payload.meta).toMatchObject({
      language: "en"
    });
  });

  it("uses the selected language when provided", () => {
    const payload = buildPayload(
      {
        language: ["en", "de"],
        name: "Quote",
        renderPage: "./render.html",
        version: "0.1.0"
      },
      "https://integration.test/config.json",
      {
        configPath: "config.json",
        language: "fr"
      }
    );

    expect(payload.meta).toMatchObject({
      language: "fr"
    });
  });
});
