import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { JSDOM, VirtualConsole } from "jsdom";
import { describe, expect, it } from "vitest";
import { validateConfig } from "../src";

const root = resolve(import.meta.dirname, "..");
const fixtureDir = resolve(root, "test/fixtures/xkcd-like");

async function loadFixtureRenderHtml(): Promise<string> {
  const [renderHtml, browserBundle] = await Promise.all([
    readFile(resolve(fixtureDir, "render.html"), "utf8"),
    readFile(resolve(root, "dist/paperless.iife.js"), "utf8")
  ]);

  return renderHtml.replace(
    '<script src="./paperless.iife.js"></script>',
    `<script>${browserBundle}</script>`
  );
}

describe("static XKCD-like integration fixture", () => {
  it("uses a simple config.json shape", async () => {
    const config = JSON.parse(await readFile(resolve(fixtureDir, "config.json"), "utf8"));

    expect(validateConfig(config)).toEqual({
      valid: true,
      errors: [],
      warnings: []
    });
    expect(config.renderPage).toBe("./render.html");
  });

  it("renders through the copied browser helper and marks the page ready", async () => {
    const fetchCalls: string[] = [];
    const virtualConsole = new VirtualConsole();
    const errors: unknown[] = [];
    virtualConsole.on("jsdomError", (error) => errors.push(error));

    const dom = new JSDOM(await loadFixtureRenderHtml(), {
      url: "https://integration.test/render.html?kind=random&difference=356",
      runScripts: "dangerously",
      pretendToBeVisual: true,
      virtualConsole,
      beforeParse(window) {
        window.fetch = async (input: RequestInfo | URL) => {
          const url = new URL(String(input));
          fetchCalls.push(url.toString());

          return {
            async json() {
              return {
                title: "XKCD & Friends",
                num: 356,
                img: "https://imgs.xkcd.com/comics/nerd_sniping.png",
                alt: "A <safe> alt"
              };
            }
          } as Response;
        };
      }
    });

    await dom.window.__paperlessRenderDone;

    expect(errors).toEqual([]);
    expect(fetchCalls).toEqual([
      "https://integration.test/api/xkcd?kind=random&difference=356"
    ]);
    expect(dom.window.document.querySelector("#website-has-loading-element")).toBeNull();
    expect(dom.window.document.querySelector("#website-has-loaded")?.textContent).toBe("ready");
    expect(dom.window.document.querySelector(".pp-title")?.innerHTML).toBe("XKCD &amp; Friends");
    expect(dom.window.document.querySelector("img")?.getAttribute("alt")).toBe("A <safe> alt");
  });
});

declare global {
  interface Window {
    __paperlessRenderDone?: Promise<void>;
  }
}
