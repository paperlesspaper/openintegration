import { watch, type FSWatcher } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateConfig } from "./manifest";
import { createPreviewHtml } from "./previewHtml";
import { renderUrlWithPuppeteer } from "./puppeteerRender";
import type { JsonRecord, OpenIntegrationConfig } from "./types";

export interface DevServerOptions {
  configPath: string;
  host?: string;
  port?: number;
  settings?: JsonRecord;
  language?: string;
  orientation?: string;
  frameKind?: string;
  color?: string;
  watch?: boolean;
}

export interface DevServerHandle {
  url: string;
  liveReload: boolean;
  close(): Promise<void>;
}

const mimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp"
};

function resolveConfigPath(configPath: string): string {
  return isAbsolute(configPath) ? configPath : resolve(process.cwd(), configPath);
}

function isInside(root: string, filePath: string): boolean {
  const path = relative(root, filePath);
  return path === "" || (!path.startsWith("..") && !path.includes(`..${sep}`));
}

function send(response: ServerResponse, status: number, body: string | Buffer, type: string): void {
  response.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "Content-Type": type
  });
  response.end(body);
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  send(response, status, JSON.stringify(value, null, 2), "application/json; charset=utf-8");
}

function sendEvent(response: ServerResponse, event: string, value: unknown): void {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(value)}\n\n`);
}

function packageRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return undefined;
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function readConfig(configPath: string): Promise<OpenIntegrationConfig> {
  const raw = await readFile(configPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const validation = validateConfig(parsed);

  if (!validation.valid) {
    throw new Error(`Invalid config.json:\n${validation.errors.map((error) => `- ${error}`).join("\n")}`);
  }

  return parsed as OpenIntegrationConfig;
}

export function buildPayload(
  config: OpenIntegrationConfig,
  configUrl: string,
  options: DevServerOptions
): JsonRecord {
  const pluginSettings: JsonRecord = {
    ...(config.nativeSettings ?? {}),
    ...(options.settings ?? {})
  };

  if (typeof options.color === "string" && options.color) {
    pluginSettings.color = options.color;
  }

  return {
    id: "paperlesspaper-dev-preview",
    draft: true,
    meta: {
      color: options.color,
      frameKind: options.frameKind ?? "epd7",
      language: options.language ?? "de",
      orientation: options.orientation ?? "landscape",
      pluginConfigUrl: configUrl,
      pluginManifest: config,
      pluginSettings
    }
  };
}

function withPayloadColor(payload: JsonRecord, color?: string): JsonRecord {
  if (typeof color !== "string" || !color) {
    return payload;
  }

  const meta = isRecord(payload.meta) ? payload.meta : {};
  const pluginSettings = isRecord(meta.pluginSettings) ? meta.pluginSettings : {};

  return {
    ...payload,
    meta: {
      ...meta,
      color,
      pluginSettings: {
        ...pluginSettings,
        color
      }
    }
  };
}

export function toPreviewPagePath(page: string): string {
  if (/^https?:\/\//.test(page)) {
    return page;
  }

  return `/${page.replace(/^\.?\//, "")}`;
}

function queryToRecord(params: URLSearchParams): JsonRecord {
  const query: JsonRecord = {};

  for (const [key, value] of params) {
    query[key] = value;
  }

  return query;
}

async function tryServeApi(
  response: ServerResponse,
  requestUrl: URL,
  integrationRoot: string
): Promise<boolean> {
  if (!requestUrl.pathname.startsWith("/api/")) {
    return false;
  }

  const apiPath = resolve(integrationRoot, `.${requestUrl.pathname}.js`);

  if (!isInside(integrationRoot, apiPath)) {
    send(response, 403, "Forbidden", "text/plain; charset=utf-8");
    return true;
  }

  try {
    const info = await stat(apiPath);

    if (!info.isFile()) {
      return false;
    }

    const moduleUrl = pathToFileURL(apiPath);
    moduleUrl.searchParams.set("t", String(Date.now()));
    const mod = (await import(moduleUrl.href)) as { default?: unknown };

    if (typeof mod.default !== "function") {
      send(response, 500, `API module has no default function: ${requestUrl.pathname}.js`, "text/plain; charset=utf-8");
      return true;
    }

    const result = await mod.default({
      query: queryToRecord(requestUrl.searchParams)
    });
    sendJson(response, 200, result);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function tryServeFile(response: ServerResponse, filePath: string, root: string): Promise<boolean> {
  const resolved = resolve(filePath);

  if (!isInside(root, resolved)) {
    send(response, 403, "Forbidden", "text/plain; charset=utf-8");
    return true;
  }

  try {
    const info = await stat(resolved);

    if (!info.isFile()) {
      return false;
    }

    const body = await readFile(resolved);
    send(response, 200, body, mimeTypes[extname(resolved)] ?? "application/octet-stream");
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

export async function startDevServer(options: DevServerOptions): Promise<DevServerHandle> {
  const host = options.host ?? "127.0.0.1";
  const requestedPort = options.port ?? 4300;
  const configPath = resolveConfigPath(options.configPath);
  const integrationRoot = dirname(configPath);
  const config = await readConfig(configPath);
  const distRoot = resolve(packageRoot(), "dist");
  const eventClients = new Set<ServerResponse>();
  let fileWatcher: FSWatcher | undefined;
  let changeTimer: ReturnType<typeof setTimeout> | undefined;
  let liveReload = false;

  const broadcastReload = (fileName?: string | null) => {
    for (const client of eventClients) {
      sendEvent(client, "reload", {
        file: fileName,
        time: Date.now()
      });
    }
  };

  if (options.watch !== false) {
    try {
      fileWatcher = watch(integrationRoot, { recursive: true }, (_eventType, fileName) => {
        if (fileName && /(^|\/)(screenshots|node_modules)\//.test(String(fileName))) {
          return;
        }

        if (changeTimer) {
          clearTimeout(changeTimer);
        }

        changeTimer = setTimeout(() => broadcastReload(fileName ? String(fileName) : null), 120);
      });
      liveReload = true;
    } catch {
      liveReload = false;
    }
  }

  const server = createServer(async (request, response) => {
    try {
      const hostHeader = request.headers.host ?? `${host}:${requestedPort}`;
      const requestUrl = new URL(request.url ?? "/", `http://${hostHeader}`);

      if (requestUrl.pathname === "/__paperless/health") {
        sendJson(response, 200, { ok: true });
        return;
      }

      if (requestUrl.pathname === "/__paperless/render" && request.method === "POST") {
        const body = (await readJsonBody(request)) as JsonRecord | undefined;
        const width = Number(body?.width ?? 800);
        const height = Number(body?.height ?? 480);
        const configUrl = new URL("/config.json", `http://${hostHeader}`).href;
        const bodyColor = typeof body?.color === "string" ? body.color : undefined;
        const payload = isRecord(body?.payload)
          ? withPayloadColor(body.payload, bodyColor)
          : buildPayload(config, configUrl, {
              ...options,
              color: bodyColor ?? options.color,
              settings: isRecord(body?.settings) ? body.settings : options.settings
            });
        const renderUrl = new URL(toPreviewPagePath(config.renderPage), `http://${hostHeader}`);

        const result = await renderUrlWithPuppeteer({
          height,
          optimize: body?.optimize !== false,
          payload,
          url: renderUrl.href,
          width
        });

        response.writeHead(200, {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store",
          "Content-Type": "image/png",
          "X-Paperless-Epd-Image-Kind": result.epd?.imageKind ?? "",
          "X-Paperless-Epd-Intent": result.epd?.intent ?? "",
          "X-Paperless-Epd-Processing-Preset": result.epd?.processingPreset ?? "",
          "X-Paperless-Epd-Used-Colors": result.epd?.usedColors.join(",") ?? "",
          "X-Paperless-Render-Height": String(result.height),
          "X-Paperless-Render-Optimized": String(result.optimized),
          "X-Paperless-Render-Ready": String(result.ready),
          "X-Paperless-Render-Width": String(result.width)
        });
        response.end(result.buffer);
        return;
      }

      if (requestUrl.pathname === "/__paperless/events") {
        response.writeHead(200, {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store",
          "Connection": "keep-alive",
          "Content-Type": "text/event-stream"
        });
        sendEvent(response, "ready", {
          watch: liveReload,
          time: Date.now()
        });
        eventClients.add(response);
        request.on("close", () => {
          eventClients.delete(response);
        });
        return;
      }

      if (requestUrl.pathname === "/__paperless/preview") {
        const configUrl = new URL("/config.json", `http://${hostHeader}`).href;
        const payload = buildPayload(config, configUrl, options);
        const html = createPreviewHtml({
          config,
          configUrl,
          payload,
          renderPath: toPreviewPagePath(config.renderPage),
          settingsPath: config.settingsPage ? toPreviewPagePath(config.settingsPage) : undefined
        });
        send(response, 200, html, "text/html; charset=utf-8");
        return;
      }

      const decodedPath = decodeURIComponent(requestUrl.pathname);
      const pathName = decodedPath === "/" ? `/${config.renderPage}` : decodedPath;

      if (await tryServeApi(response, requestUrl, integrationRoot)) {
        return;
      }

      const integrationPath = join(integrationRoot, pathName);

      if (await tryServeFile(response, integrationPath, integrationRoot)) {
        return;
      }

      const assetName = pathName.replace(/^\/assets\//, "/");

      if (["/paperless.css", "/paperless.js", "/paperless.iife.js"].includes(assetName)) {
        if (await tryServeFile(response, join(distRoot, assetName), distRoot)) {
          return;
        }
      }

      send(response, 404, "Not found", "text/plain; charset=utf-8");
    } catch (error) {
      send(response, 500, String((error as Error).stack ?? error), "text/plain; charset=utf-8");
    }
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(requestedPort, host, () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : requestedPort;
  const url = `http://${host}:${port}/__paperless/preview`;

  return {
    liveReload,
    url,
    close() {
      return new Promise((resolveClose, rejectClose) => {
        if (changeTimer) {
          clearTimeout(changeTimer);
        }

        fileWatcher?.close();

        for (const client of eventClients) {
          client.end();
        }

        server.close((error) => {
          if (error) {
            rejectClose(error);
            return;
          }

          resolveClose();
        });
      });
    }
  };
}
