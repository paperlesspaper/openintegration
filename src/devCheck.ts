import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validateConfig } from "./manifest";
import type { JsonRecord, OpenIntegrationConfig } from "./types";

export interface CheckMessage {
  level: "error" | "warning" | "info";
  message: string;
}

export interface CheckResult {
  configPath: string;
  valid: boolean;
  messages: CheckMessage[];
}

function resolveConfigPath(configPath: string): string {
  return isAbsolute(configPath) ? configPath : resolve(process.cwd(), configPath);
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isExternalPage(value: string): boolean {
  return /^https?:\/\//.test(value);
}

function resolveIntegrationFile(root: string, fileName: string): string {
  return resolve(root, fileName.replace(/^\.?\//, ""));
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const info = await stat(filePath);
    return info.isFile();
  } catch {
    return false;
  }
}

async function checkPage(
  messages: CheckMessage[],
  root: string,
  label: string,
  page: string | undefined
): Promise<void> {
  if (!page) {
    return;
  }

  if (isExternalPage(page)) {
    messages.push({ level: "info", message: `${label} is external: ${page}` });
    return;
  }

  const filePath = resolveIntegrationFile(root, page);

  if (!(await fileExists(filePath))) {
    messages.push({ level: "error", message: `${label} does not exist: ${page}` });
    return;
  }

  messages.push({ level: "info", message: `${label} found: ${page}` });
}

async function checkApiModules(messages: CheckMessage[], root: string): Promise<void> {
  const apiDir = resolve(root, "api");

  try {
    const entries = await readdir(apiDir, { withFileTypes: true });
    const modules = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".js"));

    if (modules.length === 0) {
      messages.push({ level: "warning", message: "api/ exists but contains no .js handlers" });
      return;
    }

    for (const entry of modules) {
      const apiPath = resolve(apiDir, entry.name);
      const moduleUrl = pathToFileURL(apiPath);
      moduleUrl.searchParams.set("check", String(Date.now()));
      const mod = (await import(moduleUrl.href)) as { default?: unknown };

      if (typeof mod.default !== "function") {
        messages.push({ level: "error", message: `api/${entry.name} has no default function export` });
      } else {
        messages.push({ level: "info", message: `api/${entry.name} default handler found` });
      }
    }
  } catch {
    messages.push({ level: "info", message: "No api/ directory found" });
  }
}

async function checkLanguageFiles(messages: CheckMessage[], root: string, config: OpenIntegrationConfig): Promise<void> {
  if (!Array.isArray(config.language) || config.language.length === 0) {
    return;
  }

  for (const language of config.language) {
    const relativePath = `languages/${language}.json`;
    const filePath = resolve(root, relativePath);

    try {
      const raw = await readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;

      if (!isRecord(parsed)) {
        messages.push({ level: "error", message: `${relativePath} must contain a JSON object` });
        continue;
      }

      messages.push({ level: "info", message: `${relativePath} found` });
    } catch (error) {
      messages.push({
        level: "error",
        message: `${relativePath} is missing or invalid: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }
}

function checkSchema(messages: CheckMessage[], config: OpenIntegrationConfig): void {
  if (!("formSchema" in config)) {
    messages.push({ level: "warning", message: "formSchema is missing" });
    return;
  }

  const schema = config.formSchema;

  if (!isRecord(schema)) {
    messages.push({ level: "error", message: "formSchema must be an object" });
    return;
  }

  if (schema.type !== "object") {
    messages.push({ level: "warning", message: "formSchema.type should be object for generated controls" });
  }

  if (!isRecord(schema.properties)) {
    messages.push({ level: "warning", message: "formSchema.properties is missing; no controls can be generated" });
    return;
  }

  const nativeSettings = isRecord(config.nativeSettings) ? config.nativeSettings : {};

  for (const key of Object.keys(nativeSettings)) {
    if (!(key in schema.properties)) {
      messages.push({
        level: "warning",
        message: `nativeSettings.${key} has no matching formSchema property`
      });
    }
  }

  messages.push({
    level: "info",
    message: `${Object.keys(schema.properties).length} formSchema field(s) available`
  });
}

export async function checkIntegration(configPathInput: string): Promise<CheckResult> {
  const configPath = resolveConfigPath(configPathInput);
  const root = dirname(configPath);
  const messages: CheckMessage[] = [];
  let config: OpenIntegrationConfig | undefined;

  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const validation = validateConfig(parsed);

    for (const error of validation.errors) {
      messages.push({ level: "error", message: error });
    }

    for (const warning of validation.warnings) {
      messages.push({ level: "warning", message: warning });
    }

    if (validation.valid) {
      config = parsed as OpenIntegrationConfig;
      messages.push({ level: "info", message: "config.json is valid" });
    }
  } catch (error) {
    messages.push({
      level: "error",
      message: `Could not read config.json: ${error instanceof Error ? error.message : String(error)}`
    });
  }

  if (config) {
    await checkPage(messages, root, "renderPage", config.renderPage);
    await checkPage(messages, root, "settingsPage", config.settingsPage);
    await checkLanguageFiles(messages, root, config);
    checkSchema(messages, config);
    await checkApiModules(messages, root);
  }

  return {
    configPath,
    valid: !messages.some((message) => message.level === "error"),
    messages
  };
}
