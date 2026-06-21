import type { JsonRecord, OpenIntegrationConfig, ValidationResult } from "./types";

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isLanguageCode(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(value.trim());
}

export function validateConfig(config: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isRecord(config)) {
    return {
      valid: false,
      errors: ["config must be an object"],
      warnings
    };
  }

  if (typeof config.name !== "string" || config.name.trim() === "") {
    errors.push("name is required");
  }

  if (typeof config.version !== "string" || config.version.trim() === "") {
    errors.push("version is required");
  }

  if (typeof config.renderPage !== "string" || config.renderPage.trim() === "") {
    errors.push("renderPage is required");
  }

  if ("settingsPage" in config && typeof config.settingsPage !== "string") {
    errors.push("settingsPage must be a string");
  }

  if (
    "language" in config &&
    (!Array.isArray(config.language) || config.language.some((language) => !isLanguageCode(language)))
  ) {
    errors.push("language must be an array of non-empty language codes");
  }

  if ("nativeSettings" in config && !isRecord(config.nativeSettings)) {
    errors.push("nativeSettings must be an object");
  }

  if ("formSchema" in config && !isRecord(config.formSchema)) {
    errors.push("formSchema must be an object");
  }

  if (!("description" in config)) {
    warnings.push("description is missing");
  }

  if (!("nativeSettings" in config)) {
    warnings.push("nativeSettings is missing");
  }

  if (!("formSchema" in config)) {
    warnings.push("formSchema is missing");
  }

  if (typeof config.renderPage === "string" && isHttpUrl(config.renderPage)) {
    warnings.push("renderPage should usually be relative");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

export type { OpenIntegrationConfig };
