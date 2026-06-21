import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkIntegration } from "../src/devCheck";

async function createIntegration(files: Record<string, string>): Promise<string> {
  const targetDir = await mkdtemp(join(tmpdir(), "openintegration-check-"));

  for (const [path, body] of Object.entries(files)) {
    const filePath = join(targetDir, path);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, body);
  }

  return targetDir;
}

function config(language: string[]): string {
  return JSON.stringify(
    {
      description: "Language check",
      formSchema: {
        properties: {},
        type: "object"
      },
      language,
      name: "Language Check",
      nativeSettings: {},
      renderPage: "./render.html",
      version: "1.0.0"
    },
    null,
    2
  );
}

describe("dev check language files", () => {
  it("accepts declared language JSON files", async () => {
    const targetDir = await createIntegration({
      "config.json": config(["de", "en"]),
      "languages/de.json": JSON.stringify({ title: "Hallo" }),
      "languages/en.json": JSON.stringify({ title: "Hello" }),
      "render.html": "<!doctype html>"
    });

    const result = await checkIntegration(join(targetDir, "config.json"));

    expect(result.valid).toBe(true);
    expect(result.messages).toEqual(
      expect.arrayContaining([
        { level: "info", message: "languages/de.json found" },
        { level: "info", message: "languages/en.json found" }
      ])
    );
  });

  it("reports missing and non-object language JSON files", async () => {
    const targetDir = await createIntegration({
      "config.json": config(["de", "en"]),
      "languages/en.json": "[]",
      "render.html": "<!doctype html>"
    });

    const result = await checkIntegration(join(targetDir, "config.json"));

    expect(result.valid).toBe(false);
    expect(result.messages.some((message) => message.message.startsWith("languages/de.json is missing"))).toBe(true);
    expect(result.messages).toEqual(
      expect.arrayContaining([
        { level: "error", message: "languages/en.json must contain a JSON object" }
      ])
    );
  });
});
