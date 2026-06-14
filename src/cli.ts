import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildPayload, readConfig, startDevServer, toPreviewPagePath } from "./devServer";
import { checkIntegration } from "./devCheck";
import { renderUrlWithPuppeteer } from "./puppeteerRender";
import { scaffoldIntegration } from "./scaffold";
import type { JsonRecord } from "./types";

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
  raw?: boolean;
  readyTimeoutMs?: number;
  viewport?: string;
  watch?: boolean;
  help?: boolean;
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
  --color <theme>            Initial color theme.
  --chrome-bin <path>        Chrome executable for Puppeteer.
  --no-watch                 Disable live reload in dev.
  --output <path>            Render output PNG path.
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

      if (!Number.isInteger(parsed.port) || parsed.port <= 0) {
        throw new Error("--port must be a positive integer");
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

      const result = await renderUrlWithPuppeteer({
        chromePath: args.chromePath,
        height: viewport.height,
        optimize: !args.raw,
        payload,
        readyTimeoutMs: args.readyTimeoutMs,
        url: renderUrl.href,
        width: viewport.width
      });
      const output = resolve(
        args.output ?? `render-output/${safeSlug(config.name)}-${viewport.width}x${viewport.height}.png`
      );

      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, result.buffer);
      console.log(`Rendered ${result.width}x${result.height} PNG: ${output}`);
      console.log(`Ready marker: ${result.ready ? "yes" : "no"}`);
      console.log(`EPD optimized: ${result.optimized ? "yes" : "no"}`);

      if (result.epd) {
        console.log(`EPD image kind: ${result.epd.imageKind}`);
        console.log(`EPD colors: ${result.epd.usedColors.join(", ") || "none"}`);
      }
    } finally {
      await server.close();
    }

    return;
  }

  const server = await startDevServer({
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
