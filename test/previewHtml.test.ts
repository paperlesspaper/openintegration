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

  it("shows manifest icon and config variant screenshot controls", () => {
    const html = createPreviewHtml({
      config: {
        configVariants: [
          {
            color: "light",
            layout: "compact",
            screenshots: {
              "800x480": "./screenshots/paperboy-800x480.png"
            }
          }
        ],
        icon: "./assets/icon.svg",
        name: "Paperboy",
        renderPage: "./render.html",
        version: "0.1.0"
      },
      configUrl: "http://127.0.0.1:4300/config.json",
      payload: {
        meta: {
          pluginSettings: {}
        }
      },
      renderPath: "/render.html"
    });

    expect(html).toContain('class="integration-icon" src="/assets/icon.svg"');
    expect(html).toContain('<link rel="icon" href="/assets/icon.svg" />');
    expect(html).toContain("<span>Config Variants</span>");
    expect(html).toContain('id="regenerate-variants"');
    expect(html).toContain("/__paperless/config-variants/regenerate");
    expect(html).toContain("renderConfigVariants();");
  });

  it("uses a default favicon when the manifest has no icon", () => {
    const html = createPreviewHtml({
      config: {
        name: "Paperboy",
        renderPage: "./render.html",
        version: "0.1.0"
      },
      configUrl: "http://127.0.0.1:4300/config.json",
      payload: {
        meta: {
          pluginSettings: {}
        }
      },
      renderPath: "/render.html"
    });

    expect(html).toContain('<link rel="icon" href="data:image/svg+xml,');
    expect(html).not.toContain('class="integration-icon"');
  });

  it("shows a language selector when languages are declared", () => {
    const html = createPreviewHtml({
      config: {
        language: ["de", "en"],
        name: "Paperboy",
        renderPage: "./render.html",
        version: "0.1.0"
      },
      configUrl: "http://127.0.0.1:4300/config.json",
      payload: {
        meta: {
          language: "de",
          pluginSettings: {}
        }
      },
      renderPath: "/render.html"
    });

    expect(html).toContain('<select id="language">');
    expect(html).toContain('<option value="de">de</option>');
    expect(html).toContain('<option value="en">en</option>');
    expect(html).toContain("language?.addEventListener");
    expect(html).toContain("language: language?.value || basePayload.meta.language");
  });
});
