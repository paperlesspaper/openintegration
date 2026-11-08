import { parseRenderRegions } from "./renderRegions";
import { installEmbeddedRenderBridge } from "./renderEmbedded";
import type { Browser, Page } from "puppeteer-core";
import { optimizePngForSpectra6, type EpdOptimizeResult } from "./epdOptimize";
import {
  EPD_OPTIMIZE_META_NAME,
  parseEpdOptimizeMetaContent,
  type EpdOptimizeMetaSettings
} from "./epdOptimizeMeta";
import type { JsonRecord } from "./types";

export { parseEpdOptimizeMetaContent } from "./epdOptimizeMeta";

export interface PuppeteerRenderOptions {
  chromePath?: string;
  height: number;
  optimize?: boolean;
  payload?: JsonRecord;
  readyTimeoutMs?: number;
  timezone?: string;
  url: string;
  width: number;
}

export interface PuppeteerRenderResult {
  buffer: Buffer;
  epd?: EpdOptimizeResult;
  height: number;
  optimized: boolean;
  ready: boolean;
  width: number;
}

const MAC_CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PUPPETEER_CHROME_ARGS = [
  "--no-sandbox",
  "--disable-font-subpixel-positioning",
  "--disable-lcd-text",
  "--font-render-hinting=none"
];
const COLOR_THEME_CLASSES = [
  "dark",
  "light",
  "red-dark",
  "red-light",
  "blue-dark",
  "blue-light",
  "green-dark",
  "green-light",
  "black",
  "white",
  "blue",
  "green",
  "red",
  "yellow"
];

function resolveChromePath(chromePath?: string): string | undefined {
  return (
    chromePath ||
    process.env.CHROME_BIN ||
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    (process.platform === "darwin" ? MAC_CHROME_PATH : undefined)
  );
}

async function readEpdOptimizeMetaSettings(page: Page): Promise<EpdOptimizeMetaSettings | undefined> {
  const content = await page.evaluate((metaName) => {
    return document.querySelector(`meta[name="${metaName}"]`)?.getAttribute("content");
  }, EPD_OPTIMIZE_META_NAME);

  return parseEpdOptimizeMetaContent(content);
}

async function waitForOptionalNetworkIdle(page: Page): Promise<void> {
  const waitForNetworkIdle = page.waitForNetworkIdle?.bind(page);

  if (!waitForNetworkIdle) {
    return;
  }

  await waitForNetworkIdle({ idleTime: 500, timeout: 5000 }).catch(() => undefined);
}

async function postInitPayload(page: Page, payload?: JsonRecord): Promise<void> {
  if (!payload) {
    return;
  }

  await page.evaluate((data, colorThemeClasses) => {
    const payloadRecord =
      data && typeof data === "object" && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : undefined;
    const meta =
      payloadRecord?.meta && typeof payloadRecord.meta === "object" && !Array.isArray(payloadRecord.meta)
        ? (payloadRecord.meta as Record<string, unknown>)
        : undefined;
    const pluginSettings =
      meta?.pluginSettings && typeof meta.pluginSettings === "object" && !Array.isArray(meta.pluginSettings)
        ? (meta.pluginSettings as Record<string, unknown>)
        : undefined;
    const settingsColor =
      pluginSettings && typeof pluginSettings.color === "string" ? pluginSettings.color : undefined;
    const color = typeof settingsColor === "string" ? settingsColor : typeof meta?.color === "string" ? meta.color : undefined;

    document.body.classList.remove(...colorThemeClasses);

    if (color && colorThemeClasses.includes(color)) {
      document.body.classList.add(color);
    }

    window.postMessage(
      {
        cmd: "message",
        data,
        type: "INIT"
      },
      "*"
    );
  }, payload, COLOR_THEME_CLASSES);
}

async function waitForReady(page: Page, timeoutMs: number): Promise<boolean> {
  try {
    await page.waitForSelector("#website-has-loaded", { timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

export async function renderUrlWithPuppeteer({
  chromePath,
  height,
  optimize = true,
  payload,
  readyTimeoutMs = 15000,
  timezone,
  url,
  width
}: PuppeteerRenderOptions): Promise<PuppeteerRenderResult> {
  const puppeteer = await import("puppeteer-core");
  let browser: Browser | undefined;

  try {
    browser = await puppeteer.launch({
      args: PUPPETEER_CHROME_ARGS,
      executablePath: resolveChromePath(chromePath),
      headless: true
    });

    const page = await browser.newPage();
    if (timezone) {
      await page.emulateTimezone(timezone);
    }
    await page.setViewport({
      deviceScaleFactor: 1,
      height,
      width
    });

    if (payload?.layout) await page.evaluateOnNewDocument(installEmbeddedRenderBridge);
    await page.goto(url, { timeout: 15000, waitUntil: "domcontentloaded" });
    if (payload?.layout && new URL(page.url()).origin !== new URL(url).origin) throw new Error("Layout redirected to an unexpected origin");
    await postInitPayload(page, payload);
    const ready = await waitForReady(page, readyTimeoutMs);
    await waitForOptionalNetworkIdle(page);
    let regions;
    if (payload?.layout) {
      const status = await page.evaluate(() => document.documentElement.dataset.paperlessRenderStatus);
      if (!ready || status !== "ready") throw new Error("Layout did not finish successfully");
      regions = parseRenderRegions(await page.evaluate(() => document.querySelector('meta[name="paperless:regions"]')?.getAttribute("content") ?? null), { width, height });
      if (!regions) throw new Error("Layout did not report its regions");
    }
    const epdOptimizeSettings = optimize ? await readEpdOptimizeMetaSettings(page) : undefined;
    const screenshot = await page.screenshot({
      fullPage: false,
      type: "png"
    });
    const rawBuffer = Buffer.from(screenshot);
    const epd = optimize && epdOptimizeSettings?.enabled !== false
      ? await optimizePngForSpectra6(rawBuffer, {
          height,
          regions,
          intent: epdOptimizeSettings?.intent,
          options: epdOptimizeSettings?.options,
          paletteName: epdOptimizeSettings?.paletteName,
          width
        })
      : undefined;

    await page.close();

    return {
      buffer: epd?.buffer ?? rawBuffer,
      epd,
      height,
      optimized: Boolean(epd),
      ready,
      width
    };
  } finally {
    await browser?.close();
  }
}
