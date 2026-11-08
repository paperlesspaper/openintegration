// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { renderUrlWithPuppeteer } from "../src/puppeteerRender";

let host: string;
let childOrigin: string;
let hostServer: Server;
let childServer: Server;
const assets = new Map<string, Buffer>();
let layoutHtml = `<!doctype html><html><head><meta charset="utf-8"><meta name="paperless:epd-optimize" content='{"intent":"readable"}'><script src="/runtime.js"></script><style>html,body{margin:0;width:100%;height:100%;font-family:Arial}#layout{width:100vw;height:100vh}</style></head><body><div id="website-has-loading-element" hidden></div><main id="layout"></main><script>PaperlessOpenIntegration.bootLayoutIntegration(document.getElementById('layout'))</script></body></html>`;
const calendarHtml = `<!doctype html><html><head><meta charset="utf-8"><meta name="paperless:epd-optimize" content='{"intent":"readable","options":{"ditheringType":"quantizationOnly"}}'><script src="/runtime.js"></script><style>html,body{margin:0;box-sizing:border-box;height:100%;font-family:Arial;background:#fff;color:#000}main{padding:20px}h1{font-size:24px;color:blue}article{border-top:2px solid #000;padding:12px 0;font-size:20px}small{font-size:14px}time{display:block;font-weight:bold}</style></head><body><div id="website-has-loading-element" hidden></div><main id="content"></main><script>
async function render(payload){PaperlessOpenIntegration.markLoading();if(payload.stall)return;await new Promise(r=>setTimeout(r,80));if(payload.fail){PaperlessOpenIntegration.markError(new Error('Fixture failed'));return;}document.getElementById('content').innerHTML='<small>SATURDAY · 7 NOVEMBER</small><h1>'+payload.title+'</h1><article><time>10:00</time>Breakfast</article><article><time>14:30</time>Walk in the park</article>';await document.fonts.ready;PaperlessOpenIntegration.markReady();}
PaperlessOpenIntegration.waitForPayload({timeoutMs:10,onUpdate:render}).then(render);
</script></body></html>`;
const listen = (server: Server) =>
  new Promise<string>((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve(`http://127.0.0.1:${(server.address() as any).port}`)
    )
  );
beforeAll(async () => {
  assets.set("/runtime.js", await readFile(resolve("dist/paperless.iife.js")));
  if (process.env.LAYOUT_PROVIDER_DIR) {
    const provider = process.env.LAYOUT_PROVIDER_DIR;
    layoutHtml = await readFile(
      resolve(provider, "applications/layout/render.html"),
      "utf8"
    );
    assets.set(
      "/assets/paperless.iife.js",
      await readFile(resolve(provider, "public/paperless.iife.js"))
    );
    assets.set(
      "/assets/paperless.css",
      await readFile(resolve(provider, "public/paperless.css"))
    );
  }
  const canvas = createCanvas(800, 600),
    ctx = canvas.getContext("2d");
  const sky = ctx.createLinearGradient(0, 0, 800, 600);
  sky.addColorStop(0, "#184b80");
  sky.addColorStop(0.5, "#adc8ce");
  sky.addColorStop(1, "#f0ad60");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 800, 600);
  ctx.fillStyle = "#e5ad52";
  ctx.beginPath();
  ctx.arc(590, 150, 65, 0, Math.PI * 2);
  ctx.fill();
  for (const [color, y] of [
    ["#62765e", 330],
    ["#374a44", 420],
    ["#1a3534", 530],
  ] as const) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 600);
    ctx.lineTo(0, y);
    ctx.lineTo(180, y - 110);
    ctx.lineTo(380, y + 40);
    ctx.lineTo(620, y - 90);
    ctx.lineTo(800, y);
    ctx.lineTo(800, 600);
    ctx.closePath();
    ctx.fill();
  }
  assets.set("/photo.png", canvas.toBuffer("image/png"));
  hostServer = createServer((req, res) => {
    res.setHeader(
      "Content-Type",
      req.url?.endsWith(".js")
        ? "text/javascript"
        : req.url?.endsWith(".css")
          ? "text/css"
          : req.url?.endsWith(".png")
            ? "image/png"
            : "text/html"
    );
    res.end(assets.get(req.url!) || layoutHtml);
  });
  childServer = createServer((req, res) => {
    res.setHeader(
      "Content-Type",
      req.url?.endsWith(".js") ? "text/javascript" : "text/html"
    );
    res.end(assets.get(req.url!) || calendarHtml);
  });
  host = await listen(hostServer);
  childOrigin = await listen(childServer);
});
afterAll(async () => {
  for (const server of [hostServer, childServer]) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
function payload(extra: Record<string, unknown> = {}) {
  return {
    layout: {
      renderId: crypto.randomUUID(),
      layout: "columns",
      ratio: 2,
      gap: 12,
      regions: [
        {
          id: "photo",
          type: "image",
          url: `${host}/photo.png`,
          processing: "photo",
        },
        {
          id: "calendar",
          type: "integration",
          url: `${childOrigin}/calendar`,
          payload: { title: "Our weekend" },
          processing: "inherit",
        },
      ],
      ...extra,
    },
  };
}
const enabled = process.env.LAYOUT_BROWSER_TESTS === "1";
describe.skipIf(!enabled)("layout Chromium rendering", () => {
  it.each([
    [800, 480],
    [480, 800],
    [1600, 1200],
    [1200, 1600],
  ])(
    "renders photo and cross-origin calendar at %i × %i",
    async (width, height) => {
      const data = payload({ layout: height > width ? "rows" : "columns" });
      const result = await renderUrlWithPuppeteer({
        url: host,
        width,
        height,
        payload: data,
        optimize: true,
      });
      expect(result.ready).toBe(true);
      expect(result.optimized).toBe(true);
      expect(result.epd?.reasons).toContain(
        "Processed layout regions independently"
      );
      const image = await loadImage(result.buffer);
      expect([image.width, image.height]).toEqual([width, height]);
      // Sparse calendar accents must survive auto-processing on the 13-inch panel.
      if (width === 1600 && height === 1200) {
        const check = createCanvas(width, height);
        check.getContext("2d").drawImage(image, 0, 0);
        const pixels = check.getContext("2d").getImageData(1085, 45, 185, 40).data;
        let blue = 0;
        for (let i = 0; i < pixels.length; i += 4)
          if (pixels[i] === 0 && pixels[i + 1] === 0 && pixels[i + 2] === 255) blue++;
        expect(blue).toBeGreaterThan(500);
      }

      if (process.env.LAYOUT_REVIEW_DIR) {
        await mkdir(process.env.LAYOUT_REVIEW_DIR, { recursive: true });
        await writeFile(
          resolve(
            process.env.LAYOUT_REVIEW_DIR,
            `layout-${width}x${height}-epd.png`
          ),
          result.buffer
        );
        const raw = await renderUrlWithPuppeteer({
          url: host,
          width,
          height,
          payload: data,
          optimize: false,
        });
        await writeFile(
          resolve(
            process.env.LAYOUT_REVIEW_DIR,
            `layout-${width}x${height}-raw.png`
          ),
          raw.buffer
        );
      }
    },
    60_000
  );
  it("renders custom HTML/CSS with a heading outside the slots", async () => {
    const result = await renderUrlWithPuppeteer({
      url: host,
      width: 800,
      height: 480,
      payload: payload({
        layout: "custom",
        html: '<div class="dashboard"><h1>Family planner</h1><paperless-slot name="photo"></paperless-slot><paperless-slot name="calendar"></paperless-slot></div>',
        css: ".dashboard{display:grid;height:100%;grid-template-columns:2fr 1fr;grid-template-rows:60px 1fr;gap:8px}h1{grid-column:1/-1;margin:0;padding:12px;color:blue}",
      }),
    });
    expect(result.optimized).toBe(true);
    if (process.env.LAYOUT_REVIEW_DIR)
      await writeFile(
        resolve(process.env.LAYOUT_REVIEW_DIR, "layout-custom-epd.png"),
        result.buffer
      );
  }, 30_000);
  it("renders four regions in a dark grid", async () => {
    const data = payload();
    data.layout.layout = "grid";
    Object.assign(data.layout, { color: "blue-dark" });
    data.layout.regions.push(
      { ...data.layout.regions[0], id: "photo-two" },
      { ...data.layout.regions[1], id: "calendar-two" }
    );
    const result = await renderUrlWithPuppeteer({
      url: host,
      width: 800,
      height: 480,
      payload: data,
    });
    expect(result.ready).toBe(true);
    expect(result.optimized).toBe(true);
  }, 30_000);
  it("rejects a child failure instead of exporting a partially loaded image", async () => {
    const data = payload();
    data.layout.regions[1].payload = { title: "Failure", fail: true } as any;
    await expect(
      renderUrlWithPuppeteer({
        url: host,
        width: 800,
        height: 480,
        payload: data,
      })
    ).rejects.toThrow("did not finish successfully");
  }, 30_000);
  it("fails the complete layout when a child never becomes ready", async () => {
    const data = payload();
    data.layout.regions[1].payload = {
      title: "Still loading",
      stall: true,
    } as any;
    await expect(
      renderUrlWithPuppeteer({
        url: host,
        width: 800,
        height: 480,
        payload: data,
      })
    ).rejects.toThrow("did not finish successfully");
  }, 30_000);
  it("rejects overlapping custom slots", async () => {
    await expect(
      renderUrlWithPuppeteer({
        url: host,
        width: 800,
        height: 480,
        payload: payload({
          layout: "custom",
          html: '<paperless-slot name="photo"></paperless-slot><paperless-slot name="calendar"></paperless-slot>',
          css: "paperless-slot {position:absolute;inset:0}",
        }),
      })
    ).rejects.toThrow("did not finish successfully");
  }, 30_000);
});
