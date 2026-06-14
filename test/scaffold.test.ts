import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateConfig } from "../src/manifest";
import { buildScaffoldFiles, scaffoldIntegration } from "../src/scaffold";

describe("integration scaffold", () => {
  it("builds a valid starter config and render page", () => {
    const files = buildScaffoldFiles({
      name: "Weather Board",
      targetDir: "weather-board"
    });
    const config = JSON.parse(files.find((file) => file.path === "config.json")?.body ?? "{}");
    const render = files.find((file) => file.path === "render.html")?.body ?? "";

    expect(validateConfig(config)).toEqual({
      errors: [],
      valid: true,
      warnings: []
    });
    expect(render).toContain("waitForPayload");
    expect(render).toContain("markReady()");
    expect(render).toContain("./api/data");
    expect(files.map((file) => file.path)).toContain("api/data.js");
  });

  it("can build a static-only starter", () => {
    const files = buildScaffoldFiles({
      api: false,
      name: "Static Board",
      targetDir: "static-board"
    });

    expect(files.map((file) => file.path)).not.toContain("api/data.js");
    expect(files.find((file) => file.path === "render.html")?.body).not.toContain("./api/data");
  });

  it("writes files without overwriting by default", async () => {
    const targetDir = await mkdtemp(join(tmpdir(), "openintegration-scaffold-"));
    const result = await scaffoldIntegration({
      name: "Starter",
      targetDir
    });

    expect(result.files.some((file) => file.endsWith("config.json"))).toBe(true);
    await expect(scaffoldIntegration({ name: "Starter", targetDir })).rejects.toThrow();

    const config = JSON.parse(await readFile(join(targetDir, "config.json"), "utf8"));
    expect(config.name).toBe("Starter");
  });
});
