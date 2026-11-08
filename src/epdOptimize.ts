import { parseRenderRegions, type RenderRegion } from "./renderRegions";
import { createCanvas, loadImage, type Canvas as NodeCanvas } from "@napi-rs/canvas";
import {
  ditherImage,
  replaceColors,
  suggestCanvasProcessingOptions,
  type AutoProcessingIntent,
  type CanvasLike,
  type DitherImageOptions,
  type ImageKind,
  type PaletteColorEntry
} from "epdoptimize";
import {
  resolveEpdOptimizePalette,
  type EpdOptimizePaletteName
} from "./epdOptimizeMeta";

export interface EpdOptimizeOptions {
  regions?: RenderRegion[];
  height: number;
  intent?: AutoProcessingIntent;
  options?: Partial<DitherImageOptions>;
  paletteName?: EpdOptimizePaletteName;
  width: number;
}

export interface EpdOptimizeResult {
  buffer: Buffer;
  height: number;
  imageKind: ImageKind;
  intent: AutoProcessingIntent;
  processingPreset?: string;
  reasons: string[];
  usedColors: string[];
  width: number;
}

function asCanvasLike(canvas: NodeCanvas): CanvasLike {
  return canvas as unknown as CanvasLike;
}

function getProcessingPreset(options: Partial<DitherImageOptions>): string | undefined {
  return typeof options.processingPreset === "string" ? options.processingPreset : undefined;
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue]
    .map((channel) => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

function getUsedDeviceColors(canvas: NodeCanvas, palette: PaletteColorEntry[]): string[] {
  const deviceColors = new Set(palette.map((entry) => entry.deviceColor.toUpperCase()));
  const context = canvas.getContext("2d");
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const used = new Set<string>();

  for (let index = 0; index < image.data.length; index += 4) {
    const color = rgbToHex(image.data[index], image.data[index + 1], image.data[index + 2]);

    if (deviceColors.has(color)) {
      used.add(color);
    }
  }

  return Array.from(used).sort();
}

export async function optimizePngForSpectra6(
  sourcePng: Buffer,
  { height, intent = "readable", options = {}, paletteName, width, regions }: EpdOptimizeOptions
): Promise<EpdOptimizeResult> {
  const palette = resolveEpdOptimizePalette(paletteName);
  const image = await loadImage(sourcePng);
  const inputCanvas = createCanvas(width, height) as NodeCanvas;
  const inputContext = inputCanvas.getContext("2d");
  inputContext.drawImage(image, 0, 0, width, height);

  if (regions?.length) {
    parseRenderRegions(JSON.stringify(regions), { width, height });
    if (image.width !== width || image.height !== height) throw new Error("Layout screenshot dimensions do not match");
    inputContext.fillStyle = "#fff";
    for (const region of regions) inputContext.fillRect(region.x, region.y, region.width, region.height);
    const base = await optimizePngForSpectra6(inputCanvas.toBuffer("image/png"), { width, height, paletteName, intent: "readable" });
    inputContext.drawImage(await loadImage(base.buffer), 0, 0);
    inputContext.imageSmoothingEnabled = false;
    for (const region of regions) {
      const patch = createCanvas(region.width, region.height);
      const context = patch.getContext("2d");
      context.drawImage(image, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height);
      let processed = patch.toBuffer("image/png");
      if (region.settings?.enabled === false) {
        const pixels = context.getImageData(0, 0, region.width, region.height).data;
        const allowed = new Set(palette.map(color => color.deviceColor.toUpperCase()));
        for (let i = 0; i < pixels.length; i += 4)
          if (!allowed.has(rgbToHex(pixels[i], pixels[i + 1], pixels[i + 2])) || pixels[i + 3] !== 255)
            throw new Error("Unprocessed layout regions must already use opaque device colors");
      } else {
        processed = (await optimizePngForSpectra6(processed, { width: region.width, height: region.height, paletteName,
          intent: region.settings?.intent, options: region.settings?.options })).buffer;
      }
      inputContext.drawImage(await loadImage(processed), region.x, region.y);
    }
    return { ...base, buffer: inputCanvas.toBuffer("image/png"), usedColors: getUsedDeviceColors(inputCanvas, palette), reasons: ["Processed layout regions independently"] };
  }
  const ditheredCanvas = createCanvas(width, height) as NodeCanvas;
  const deviceCanvas = createCanvas(width, height) as NodeCanvas;
  const suggestion = suggestCanvasProcessingOptions(
    asCanvasLike(inputCanvas),
    palette,
    { intent }
  );

  // Sparse calendars can be classified as grayscale because most pixels are white.
  // Keep deliberate accent colors in readable content; explicit options below still win.
  if (intent === "readable" && suggestion.ditherOptions.toneMapping?.saturation === -1) {
    suggestion.ditherOptions.toneMapping = {
      ...suggestion.ditherOptions.toneMapping,
      saturation: 0,
    };
  }

  await ditherImage(asCanvasLike(inputCanvas), asCanvasLike(ditheredCanvas), {
    ...suggestion.ditherOptions,
    ...options,
    palette
  });

  replaceColors(asCanvasLike(ditheredCanvas), asCanvasLike(deviceCanvas), palette);

  return {
    buffer: deviceCanvas.toBuffer("image/png"),
    height,
    imageKind: suggestion.imageKind,
    intent: suggestion.intent,
    processingPreset: getProcessingPreset(suggestion.ditherOptions),
    reasons: suggestion.reasons,
    usedColors: getUsedDeviceColors(deviceCanvas, palette),
    width
  };
}
