import type { Browser, Page } from "puppeteer-core";
import type { AutoProcessingIntent } from "epdoptimize";
import { optimizePngForSpectra6, type EpdOptimizeResult } from "./epdOptimize";
import type { JsonRecord } from "./types";

export interface PuppeteerRenderOptions {
  chromePath?: string;
  height: number;
  optimize?: boolean;
  payload?: JsonRecord;
  readyTimeoutMs?: number;
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

export interface EpdOptimizeMetaSettings {
  enabled?: boolean;
  intent?: AutoProcessingIntent;
}

const MAC_CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const EPD_OPTIMIZE_META_NAME = "paperless:epd-optimize";
const EPD_OPTIMIZE_INTENTS = new Set<AutoProcessingIntent>([
  "faithful",
  "lowNoise",
  "natural",
  "readable",
  "vivid"
]);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isEpdOptimizeIntent(value: unknown): value is AutoProcessingIntent {
  return typeof value === "string" && EPD_OPTIMIZE_INTENTS.has(value as AutoProcessingIntent);
}

function normalizeEpdOptimizeSettings(value: unknown): EpdOptimizeMetaSettings | undefined {
  if (typeof value === "boolean") {
    return { enabled: value };
  }

  if (isEpdOptimizeIntent(value)) {
    return { intent: value };
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const settings: EpdOptimizeMetaSettings = {};

  if (typeof value.enabled === "boolean") {
    settings.enabled = value.enabled;
  }

  if (isEpdOptimizeIntent(value.intent)) {
    settings.intent = value.intent;
  }

  return Object.keys(settings).length > 0 ? settings : undefined;
}

export function parseEpdOptimizeMetaContent(content: string | null | undefined): EpdOptimizeMetaSettings | undefined {
  const trimmed = content?.trim();

  if (!trimmed) {
    return undefined;
  }

  const shorthand = normalizeEpdOptimizeSettings(trimmed);

  if (shorthand) {
    return shorthand;
  }

  try {
    return normalizeEpdOptimizeSettings(JSON.parse(trimmed) as unknown);
  } catch {
    return undefined;
  }
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
  url,
  width
}: PuppeteerRenderOptions): Promise<PuppeteerRenderResult> {
  const puppeteer = await import("puppeteer-core");
  let browser: Browser | undefined;

  try {
    browser = await puppeteer.launch({
      args: ["--no-sandbox"],
      executablePath: resolveChromePath(chromePath),
      headless: true
    });

    const page = await browser.newPage();
    await page.setViewport({
      deviceScaleFactor: 1,
      height,
      width
    });

    await page.goto(url, { timeout: 15000, waitUntil: "domcontentloaded" });
    await postInitPayload(page, payload);
    const ready = await waitForReady(page, readyTimeoutMs);
    await waitForOptionalNetworkIdle(page);
    const epdOptimizeSettings = optimize ? await readEpdOptimizeMetaSettings(page) : undefined;
    const screenshot = await page.screenshot({
      fullPage: false,
      type: "png"
    });
    const rawBuffer = Buffer.from(screenshot);
    const epd = optimize && epdOptimizeSettings?.enabled !== false
      ? await optimizePngForSpectra6(rawBuffer, {
          height,
          intent: epdOptimizeSettings?.intent,
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
