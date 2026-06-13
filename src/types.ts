export type JsonRecord = Record<string, unknown>;

export interface OpenIntegrationConfig {
  name: string;
  version: string;
  description?: string;
  renderPage: string;
  settingsPage?: string;
  nativeSettings?: JsonRecord;
  formSchema?: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface WaitForPayloadOptions {
  timeoutMs?: number;
  fallback?: JsonRecord;
  allowedOrigins?: string[];
}

export interface FitTextOptions {
  min?: number;
  max?: number;
  step?: number;
  nowrap?: boolean;
}

export interface FitToScreenOptions {
  padding?: number;
  maxScale?: number;
}

export interface OverflowReport {
  hasOverflow: boolean;
  elements: HTMLElement[];
}
