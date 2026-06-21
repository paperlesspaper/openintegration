import { createCanvas, loadImage, type Canvas as NodeCanvas } from "@napi-rs/canvas";
import {
  aitjcizeSpectra6Palette,
  ditherImage,
  replaceColors,
  suggestCanvasDitherOptions,
  suggestCanvasImageAdjustmentOptions,
  type AutoProcessingIntent,
  type CanvasLike,
  type DitherImageOptions,
  type ImageKind
} from "epdoptimize";
import type { Browser, Page } from "puppeteer-core";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import {
  buildPayload,
  readConfig,
  startDevServer,
  toPreviewPagePath,
  type DevServerHandle,
  type DevServerOptions
} from "./devServer";
import { checkIntegration } from "./devCheck";
import { scaffoldIntegration } from "./scaffold";
import type { JsonRecord } from "./types";

type EpdOutputMode = "dithered" | "device" | "both";

interface ParsedArgs {
  command?: string;
  configPath?: string;
  targetDir?: string;
  name?: string;
  api?: boolean;
  force?: boolean;
  host?: string;
  port?: number;
  settings?: JsonRecord;
  language?: string;
  orientation?: string;
  frameKind?: string;
  color?: string;
  chromePath?: string;
  json?: boolean;
  output?: string;
  epdOutput?: EpdOutputMode;
  raw?: boolean;
  readyTimeoutMs?: number;
  viewport?: string;
  watch?: boolean;
  help?: boolean;
}

const maxPort = 65535;
const defaultEpdOutput: EpdOutputMode = "dithered";
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
const SPECTRA_DEVICE_COLORS = new Set(
  aitjcizeSpectra6Palette.map((entry) => entry.deviceColor.toUpperCase())
);
const ditherOptionKeys = new Set<keyof DitherImageOptions>([
  "adjustmentEngine",
  "algorithm",
  "calibrate",
  "clarity",
  "colorMatching",
  "ditheringType",
  "dynamicRangeCompression",
  "edgeAntialiasing",
  "edgePreservation",
  "errorDiffusionMatrix",
  "levelCompression",
  "numberOfSampleColors",
  "orderedDitheringMatrix",
  "orderedDitheringType",
  "paperNormalization",
  "preview",
  "processingEngine",
  "processingPreset",
  "randomDitheringType",
  "sampleColorsFromImage",
  "serpentine",
  "toneMapping"
]);

interface CliEpdOptimizeMetaSettings {
  enabled?: boolean;
  intent?: AutoProcessingIntent;
  options?: Partial<DitherImageOptions>;
}

interface CliRawRenderResult {
  buffer: Buffer;
  epdOptimizeSettings?: CliEpdOptimizeMetaSettings;
  height: number;
  ready: boolean;
  width: number;
}

interface CliEpdOptimizeResult {
  deviceBuffer: Buffer;
  ditheredBuffer: Buffer;
  height: number;
  imageKind: ImageKind;
  intent: AutoProcessingIntent;
  presetName?: string;
  reasons: string[];
  usedColors: string[];
  width: number;
}

function usage(): string {
  return `Usage:
  paperlesspaper-openintegration dev [config.json] [options]
  paperlesspaper-openintegration check [config.json] [options]
  paperlesspaper-openintegration render [config.json] [options]
  paperlesspaper-openintegration scaffold <directory> [options]

Options:
  --name <name>              Integration display name for scaffold.
  --no-api                   Scaffold a static render page without api/data.js.
  --force                    Overwrite scaffold files if they already exist.
  --host <host>              Host to bind. Defaults to 127.0.0.1.
  --port <port>              Port to bind. Defaults to 4300.
  --settings <json>          JSON object merged into nativeSettings.
  --language <code>          Payload language. Defaults to de.
  --orientation <value>      Payload orientation. Defaults to landscape.
  --frame-kind <value>       Payload frame kind. Defaults to epd7.
  --color <theme>            Initial color theme. Defaults to light.
  --chrome-bin <path>        Chrome executable for Puppeteer.
  --no-watch                 Disable live reload in dev.
  --output <path>            Render output PNG path.
  --epd-output <mode>        EPD output: dithered, device, or both. Defaults to dithered.
  --raw                      Render the raw Puppeteer screenshot without epdoptimize.
  --ready-timeout <ms>       Ready marker timeout. Defaults to 15000.
  --viewport <WxH>           Render viewport. Defaults to 800x480.
  --json                     Print check results as JSON.
  -h, --help                 Show this help.
`;
}

function parseJsonRecord(value: string): JsonRecord {
  const parsed = JSON.parse(value) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("--settings must be a JSON object");
  }

  return parsed as JsonRecord;
}

function parseViewport(value = "800x480"): { width: number; height: number } {
  const match = /^(\d+)x(\d+)$/i.exec(value);

  if (!match) {
    throw new Error("--viewport must be formatted as WIDTHxHEIGHT");
  }

  return {
    height: Number(match[2]),
    width: Number(match[1])
  };
}

function safeSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "openintegration";
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isEpdOptimizeIntent(value: unknown): value is AutoProcessingIntent {
  return typeof value === "string" && EPD_OPTIMIZE_INTENTS.has(value as AutoProcessingIntent);
}

function parseEpdOutputMode(value: string): EpdOutputMode {
  if (value === "dithered" || value === "device" || value === "both") {
    return value;
  }

  throw new Error("--epd-output must be one of: dithered, device, both");
}

function asCanvasLike(canvas: NodeCanvas): CanvasLike {
  return canvas as unknown as CanvasLike;
}

function resolveChromePath(chromePath?: string): string | undefined {
  return (
    chromePath ||
    process.env.CHROME_BIN ||
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    (process.platform === "darwin" ? MAC_CHROME_PATH : undefined)
  );
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue]
    .map((channel) => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

function getUsedDeviceColors(canvas: NodeCanvas): string[] {
  const context = canvas.getContext("2d");
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const used = new Set<string>();

  for (let index = 0; index < image.data.length; index += 4) {
    const color = rgbToHex(image.data[index], image.data[index + 1], image.data[index + 2]);

    if (SPECTRA_DEVICE_COLORS.has(color)) {
      used.add(color);
    }
  }

  return Array.from(used).sort();
}

function normalizeMetaOptions(value: unknown): Partial<DitherImageOptions> {
  if (!isRecord(value)) {
    return {};
  }

  const options: Partial<DitherImageOptions> = {};

  for (const [key, optionValue] of Object.entries(value)) {
    if (ditherOptionKeys.has(key as keyof DitherImageOptions)) {
      (options as Record<string, unknown>)[key] = optionValue;
    }
  }

  return options;
}

function normalizeEpdOptimizeSettings(value: unknown): CliEpdOptimizeMetaSettings | undefined {
  if (typeof value === "boolean") {
    return { enabled: value };
  }

  if (isEpdOptimizeIntent(value)) {
    return { intent: value };
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const settings: CliEpdOptimizeMetaSettings = {};
  const options = {
    ...normalizeMetaOptions(value),
    ...normalizeMetaOptions(value.adjustmentOptions),
    ...normalizeMetaOptions(value.ditherOptions),
    ...normalizeMetaOptions(value.options)
  };

  if (typeof value.enabled === "boolean") {
    settings.enabled = value.enabled;
  }

  if (isEpdOptimizeIntent(value.intent)) {
    settings.intent = value.intent;
  }

  if (Object.keys(options).length > 0) {
    settings.options = options;
  }

  return Object.keys(settings).length > 0 ? settings : undefined;
}

function parseEpdOptimizeMetaContent(content: string | null | undefined): CliEpdOptimizeMetaSettings | undefined {
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

async function readEpdOptimizeMetaSettings(page: Page): Promise<CliEpdOptimizeMetaSettings | undefined> {
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

async function renderRawWithPuppeteer({
  chromePath,
  height,
  payload,
  readyTimeoutMs = 15000,
  url,
  width
}: {
  chromePath?: string;
  height: number;
  payload?: JsonRecord;
  readyTimeoutMs?: number;
  url: string;
  width: number;
}): Promise<CliRawRenderResult> {
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
    const epdOptimizeSettings = await readEpdOptimizeMetaSettings(page);
    const screenshot = await page.screenshot({
      fullPage: false,
      type: "png"
    });

    await page.close();

    return {
      buffer: Buffer.from(screenshot),
      epdOptimizeSettings,
      height,
      ready,
      width
    };
  } finally {
    await browser?.close();
  }
}

async function optimizePngForCliSpectra6(
  sourcePng: Buffer,
  {
    height,
    intent = "natural",
    options = {},
    width
  }: {
    height: number;
    intent?: AutoProcessingIntent;
    options?: Partial<DitherImageOptions>;
    width: number;
  }
): Promise<CliEpdOptimizeResult> {
  const image = await loadImage(sourcePng);
  const inputCanvas = createCanvas(width, height) as NodeCanvas;
  const inputContext = inputCanvas.getContext("2d");
  inputContext.drawImage(image, 0, 0, width, height);

  const ditheredCanvas = createCanvas(width, height) as NodeCanvas;
  const deviceCanvas = createCanvas(width, height) as NodeCanvas;
  const imageAuto = suggestCanvasImageAdjustmentOptions(
    asCanvasLike(inputCanvas),
    aitjcizeSpectra6Palette,
    { intent }
  );
  const canvasAuto = suggestCanvasDitherOptions(
    asCanvasLike(inputCanvas),
    aitjcizeSpectra6Palette,
    { intent }
  );

  await ditherImage(asCanvasLike(inputCanvas), asCanvasLike(ditheredCanvas), {
    ...imageAuto.adjustmentOptions,
    ...canvasAuto.ditherOptions,
    ...options,
    palette: aitjcizeSpectra6Palette
  });

  replaceColors(asCanvasLike(ditheredCanvas), asCanvasLike(deviceCanvas), aitjcizeSpectra6Palette);

  return {
    deviceBuffer: deviceCanvas.toBuffer("image/png"),
    ditheredBuffer: ditheredCanvas.toBuffer("image/png"),
    height,
    imageKind: imageAuto.imageKind,
    intent: imageAuto.intent,
    presetName: canvasAuto.presetName,
    reasons: Array.from(new Set([...imageAuto.reasons, ...canvasAuto.reasons])),
    usedColors: getUsedDeviceColors(deviceCanvas),
    width
  };
}

function outputWithSuffix(output: string, suffix: string): string {
  const extension = extname(output);
  return extension ? `${output.slice(0, -extension.length)}${suffix}${extension}` : `${output}${suffix}`;
}

function takeValue(args: string[], index: number, name: string): string {
  const value = args[index + 1];

  if (!value || value.startsWith("-")) {
    throw new Error(`${name} needs a value`);
  }

  return value;
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "-h" || arg === "--help") {
      parsed.help = true;
      continue;
    }

    if (arg === "--json") {
      parsed.json = true;
      continue;
    }

    if (arg === "--no-watch") {
      parsed.watch = false;
      continue;
    }

    if (arg === "--raw") {
      parsed.raw = true;
      continue;
    }

    if (arg === "--no-api") {
      parsed.api = false;
      continue;
    }

    if (arg === "--force") {
      parsed.force = true;
      continue;
    }

    if (arg === "--name") {
      parsed.name = takeValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--host") {
      parsed.host = takeValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--port") {
      parsed.port = Number(takeValue(argv, index, arg));

      if (!Number.isInteger(parsed.port) || parsed.port <= 0 || parsed.port > maxPort) {
        throw new Error(`--port must be a positive integer up to ${maxPort}`);
      }

      index += 1;
      continue;
    }

    if (arg === "--settings") {
      parsed.settings = parseJsonRecord(takeValue(argv, index, arg));
      index += 1;
      continue;
    }

    if (arg === "--language") {
      parsed.language = takeValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--orientation") {
      parsed.orientation = takeValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--frame-kind") {
      parsed.frameKind = takeValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--color") {
      parsed.color = takeValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--chrome-bin") {
      parsed.chromePath = takeValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--output") {
      parsed.output = takeValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--epd-output") {
      parsed.epdOutput = parseEpdOutputMode(takeValue(argv, index, arg));
      index += 1;
      continue;
    }

    if (arg === "--ready-timeout") {
      parsed.readyTimeoutMs = Number(takeValue(argv, index, arg));

      if (!Number.isFinite(parsed.readyTimeoutMs) || parsed.readyTimeoutMs < 0) {
        throw new Error("--ready-timeout must be a non-negative number");
      }

      index += 1;
      continue;
    }

    if (arg === "--viewport") {
      parsed.viewport = takeValue(argv, index, arg);
      parseViewport(parsed.viewport);
      index += 1;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (!parsed.command) {
      parsed.command = arg;
      continue;
    }

    if (parsed.command === "scaffold" || parsed.command === "init" || parsed.command === "create") {
      if (!parsed.targetDir) {
        parsed.targetDir = arg;
        continue;
      }
      throw new Error(`Unexpected argument: ${arg}`);
    }

    if (!parsed.configPath) {
      parsed.configPath = arg;
      continue;
    }

    throw new Error(`Unexpected argument: ${arg}`);
  }

  return parsed;
}

function isPortInUseError(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === "EADDRINUSE";
}

async function startDevServerWithPortFallback(options: DevServerOptions): Promise<DevServerHandle> {
  const initialPort = options.port ?? 4300;

  if (initialPort === 0) {
    return startDevServer(options);
  }

  for (let port = initialPort; port <= maxPort; port += 1) {
    try {
      return await startDevServer({
        ...options,
        port
      });
    } catch (error) {
      if (!isPortInUseError(error)) {
        throw error;
      }

      if (port < maxPort) {
        console.warn(`Port ${port} is already in use, trying ${port + 1}.`);
      }
    }
  }

  throw new Error(`No available port found from ${initialPort} to ${maxPort}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.command) {
    console.log(usage());
    return;
  }

  if (
    args.command !== "dev" &&
    args.command !== "check" &&
    args.command !== "render" &&
    args.command !== "scaffold" &&
    args.command !== "init" &&
    args.command !== "create"
  ) {
    throw new Error(`Unknown command: ${args.command}`);
  }

  if (args.command === "scaffold" || args.command === "init" || args.command === "create") {
    if (!args.targetDir) {
      throw new Error(`${args.command} needs a target directory`);
    }

    const result = await scaffoldIntegration({
      api: args.api,
      force: args.force,
      name: args.name,
      targetDir: args.targetDir
    });

    console.log(`Created OpenIntegration scaffold: ${result.targetDir}`);
    for (const file of result.files) {
      console.log(`- ${file}`);
    }
    console.log("");
    console.log(`Next: paperlesspaper-openintegration check ${result.targetDir}/config.json`);

    return;
  }

  if (args.command === "check") {
    const result = await checkIntegration(args.configPath ?? "config.json");

    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`paperlesspaper OpenIntegration check: ${result.configPath}`);

      for (const message of result.messages) {
        const prefix =
          message.level === "error" ? "ERROR" : message.level === "warning" ? "WARN" : "INFO";
        console.log(`${prefix} ${message.message}`);
      }
    }

    if (!result.valid) {
      process.exit(1);
    }

    return;
  }

  if (args.command === "render") {
    const configPath = args.configPath ?? "config.json";
    const config = await readConfig(configPath);
    const viewport = parseViewport(args.viewport);
    const server = await startDevServer({
      color: args.color,
      configPath,
      frameKind: args.frameKind,
      host: args.host,
      language: args.language,
      orientation: args.orientation,
      port: args.port ?? 0,
      settings: args.settings,
      watch: false
    });

    try {
      const origin = new URL(server.url).origin;
      const configUrl = new URL("/config.json", origin).href;
      const renderUrl = new URL(toPreviewPagePath(config.renderPage), origin);
      const payload = buildPayload(config, configUrl, {
        color: args.color,
        configPath,
        frameKind: args.frameKind,
        language: args.language,
        orientation: args.orientation,
        settings: args.settings
      });

      const rawResult = await renderRawWithPuppeteer({
        chromePath: args.chromePath,
        height: viewport.height,
        payload,
        readyTimeoutMs: args.readyTimeoutMs,
        url: renderUrl.href,
        width: viewport.width
      });
      const epdOutput = args.epdOutput ?? defaultEpdOutput;
      const shouldOptimize = !args.raw && rawResult.epdOptimizeSettings?.enabled !== false;
      const epd = shouldOptimize
        ? await optimizePngForCliSpectra6(rawResult.buffer, {
            height: viewport.height,
            intent: rawResult.epdOptimizeSettings?.intent,
            options: rawResult.epdOptimizeSettings?.options,
            width: viewport.width
          })
        : undefined;
      const output = resolve(
        args.output ?? `render-output/${safeSlug(config.name)}-${viewport.width}x${viewport.height}.png`
      );
      const outputBuffer = args.raw
        ? rawResult.buffer
        : epdOutput === "device"
          ? epd?.deviceBuffer ?? rawResult.buffer
          : epd?.ditheredBuffer ?? rawResult.buffer;
      const deviceOutput = epd && epdOutput === "both" ? outputWithSuffix(output, "-device") : undefined;

      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, outputBuffer);

      if (deviceOutput && epd) {
        await mkdir(dirname(deviceOutput), { recursive: true });
        await writeFile(deviceOutput, epd.deviceBuffer);
      }

      console.log(`Rendered ${rawResult.width}x${rawResult.height} PNG: ${output}`);
      console.log(`Ready marker: ${rawResult.ready ? "yes" : "no"}`);
      console.log(`EPD optimized: ${epd ? "yes" : "no"}`);

      if (epd) {
        console.log(`EPD output: ${epdOutput}`);
        console.log(`EPD image kind: ${epd.imageKind}`);
        console.log(`EPD intent: ${epd.intent}`);
        if (epd.presetName) {
          console.log(`EPD preset: ${epd.presetName}`);
        }
        console.log(`EPD colors: ${epd.usedColors.join(", ") || "none"}`);
      }

      if (deviceOutput) {
        console.log(`EPD device PNG: ${deviceOutput}`);
      }
    } finally {
      await server.close();
    }

    return;
  }

  const server = await startDevServerWithPortFallback({
    color: args.color,
    configPath: args.configPath ?? "config.json",
    frameKind: args.frameKind,
    host: args.host,
    language: args.language,
    orientation: args.orientation,
    port: args.port,
    settings: args.settings,
    watch: args.watch
  });

  console.log(`paperlesspaper OpenIntegration preview: ${server.url}`);
  console.log(server.liveReload ? "Live reload enabled." : "Live reload disabled.");
  console.log("Press Ctrl+C to stop.");

  const stop = async () => {
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
