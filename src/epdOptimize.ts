import { createCanvas, loadImage, type Canvas as NodeCanvas } from "@napi-rs/canvas";
import {
  aitjcizeSpectra6Palette,
  ditherImage,
  replaceColors,
  suggestCanvasProcessingOptions,
  type AutoProcessingIntent,
  type CanvasLike,
  type DitherImageOptions,
  type ImageKind
} from "epdoptimize";

export interface EpdOptimizeOptions {
  height: number;
  intent?: AutoProcessingIntent;
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

const SPECTRA_DEVICE_COLORS = new Set(
  aitjcizeSpectra6Palette.map((entry) => entry.deviceColor.toUpperCase())
);

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

export async function optimizePngForSpectra6(
  sourcePng: Buffer,
  { height, intent = "readable", width }: EpdOptimizeOptions
): Promise<EpdOptimizeResult> {
  const image = await loadImage(sourcePng);
  const inputCanvas = createCanvas(width, height) as NodeCanvas;
  const inputContext = inputCanvas.getContext("2d");
  inputContext.drawImage(image, 0, 0, width, height);

  const ditheredCanvas = createCanvas(width, height) as NodeCanvas;
  const deviceCanvas = createCanvas(width, height) as NodeCanvas;
  const suggestion = suggestCanvasProcessingOptions(
    asCanvasLike(inputCanvas),
    aitjcizeSpectra6Palette,
    { intent }
  );

  await ditherImage(asCanvasLike(inputCanvas), asCanvasLike(ditheredCanvas), {
    ...suggestion.ditherOptions,
    palette: aitjcizeSpectra6Palette
  });

  replaceColors(asCanvasLike(ditheredCanvas), asCanvasLike(deviceCanvas), aitjcizeSpectra6Palette);

  return {
    buffer: deviceCanvas.toBuffer("image/png"),
    height,
    imageKind: suggestion.imageKind,
    intent: suggestion.intent,
    processingPreset: getProcessingPreset(suggestion.ditherOptions),
    reasons: suggestion.reasons,
    usedColors: getUsedDeviceColors(deviceCanvas),
    width
  };
}
