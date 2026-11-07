import {
  acepPalette,
  aitjcizeSpectra6Palette,
  defaultPalette,
  gameboyPalette,
  genericFourGrayscalePalette,
  genericTwoColorEinkPalette,
  spectra6BoeberPalette,
  spectra6legacyPalette,
  spectra6OriginalPalette,
  spectra6OriginalPreviewPalette,
  spectra6Palette,
  trmnlSeeed16GrayscalePalette,
  type AutoProcessingIntent,
  type DitherImageOptions,
  type PaletteColorEntry
} from "epdoptimize";

export const EPD_OPTIMIZE_META_NAME = "paperless:epd-optimize";
export const DEFAULT_EPD_OPTIMIZE_PALETTE_NAME = "aitjcizeSpectra6Palette";

const EPD_OPTIMIZE_INTENTS = new Set<AutoProcessingIntent>([
  "faithful",
  "lowNoise",
  "natural",
  "readable",
  "vivid"
]);

const EPD_OPTIMIZE_PALETTES = {
  acepPalette,
  aitjcizeSpectra6Palette,
  defaultPalette,
  gameboyPalette,
  genericFourGrayscalePalette,
  genericTwoColorEinkPalette,
  spectra6BoeberPalette,
  spectra6legacyPalette,
  spectra6OriginalPalette,
  spectra6OriginalPreviewPalette,
  spectra6Palette,
  trmnlSeeed16GrayscalePalette
} satisfies Record<string, PaletteColorEntry[]>;

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

export type EpdOptimizePaletteName = keyof typeof EPD_OPTIMIZE_PALETTES;

export interface EpdOptimizeMetaSettings {
  enabled?: boolean;
  intent?: AutoProcessingIntent;
  options?: Partial<DitherImageOptions>;
  paletteName?: EpdOptimizePaletteName;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isEpdOptimizeIntent(value: unknown): value is AutoProcessingIntent {
  return typeof value === "string" && EPD_OPTIMIZE_INTENTS.has(value as AutoProcessingIntent);
}

function isEpdOptimizePaletteName(value: unknown): value is EpdOptimizePaletteName {
  return typeof value === "string" && value in EPD_OPTIMIZE_PALETTES;
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
  const options = {
    ...normalizeMetaOptions(value),
    ...normalizeMetaOptions(value.adjustmentOptions),
    ...normalizeMetaOptions(value.imageAdjustmentOptions),
    ...normalizeMetaOptions(value.canvasImageAdjustmentOptions),
    ...normalizeMetaOptions(value.ditherOptions),
    ...normalizeMetaOptions(value.canvasDitherOptions),
    ...normalizeMetaOptions(value.options)
  };

  if (typeof value.enabled === "boolean") {
    settings.enabled = value.enabled;
  }

  if (isEpdOptimizeIntent(value.intent)) {
    settings.intent = value.intent;
  }

  const paletteName = value.palette ?? value.paletteName;

  if (isEpdOptimizePaletteName(paletteName)) {
    settings.paletteName = paletteName;
  }

  if (Object.keys(options).length > 0) {
    settings.options = options;
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

export function resolveEpdOptimizePalette(name?: EpdOptimizePaletteName): PaletteColorEntry[] {
  return EPD_OPTIMIZE_PALETTES[name ?? DEFAULT_EPD_OPTIMIZE_PALETTE_NAME];
}
