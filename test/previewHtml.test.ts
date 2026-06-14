import { describe, expect, it } from "vitest";
import { createPreviewHtml } from "../src/previewHtml";

describe("preview html", () => {
  it("initializes and listens to custom settings pages", () => {
    const html = createPreviewHtml({
      config: {
        name: "Paperboy",
        renderPage: "./render.html",
        settingsPage: "./settings.html",
        version: "0.1.0"
      },
      configUrl: "http://127.0.0.1:4300/config.json",
      payload: {
        meta: {
          pluginSettings: {
            newspaper: "top3"
          }
        }
      },
      renderPath: "/render.html",
      settingsPath: "/settings.html"
    });

    expect(html).toContain('id="settings-page"');
    expect(html).toContain("reloadSettingsFrame();");
    expect(html).toContain('window.addEventListener("message", handleSettingsPageMessage)');
    expect(html).toContain("paperlesspaper:settings:ready");
  });

  it("hides generated form fields that live in a custom settings page", () => {
    const html = createPreviewHtml({
      config: {
        formSchema: {
          type: "object",
          properties: {
            newspaper: {
              type: "string",
              title: "Newspaper",
              inStettingsPage: true
            },
            fit: {
              type: "string",
              title: "Image fit"
            }
          }
        },
        name: "Paperboy",
        renderPage: "./render.html",
        settingsPage: "./settings.html",
        version: "0.1.0"
      },
      configUrl: "http://127.0.0.1:4300/config.json",
      payload: {
        meta: {
          pluginSettings: {
            fit: "cover",
            newspaper: "top3"
          }
        }
      },
      renderPath: "/render.html",
      settingsPath: "/settings.html"
    });

    expect(html).toContain('property.inStettingsPage === true');
    expect(html).toContain('property.inStettingsPage === "true"');
  });
});
