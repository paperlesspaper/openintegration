import { chmod, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
const openSansFiles = resolve(root, "node_modules/@fontsource/open-sans/files");
const openSansDist = resolve(dist, "fonts");
const openSansWeights = [300, 400, 500, 600, 700, 800];
const openSansStyles = ["normal", "italic"];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

await build({
  entryPoints: [
    resolve(root, "src/index.ts"),
    resolve(root, "src/browser.ts"),
    resolve(root, "src/ical.ts")
  ],
  bundle: true,
  format: "esm",
  outdir: dist,
  platform: "neutral",
  sourcemap: false,
  target: "es2022"
});

await build({
  entryPoints: [resolve(root, "src/cli.ts")],
  bundle: true,
  external: ["@napi-rs/canvas", "epdoptimize", "puppeteer-core"],
  format: "esm",
  outfile: resolve(dist, "cli.js"),
  platform: "node",
  banner: {
    js: "#!/usr/bin/env node"
  },
  sourcemap: false,
  target: "node18"
});

await chmod(resolve(dist, "cli.js"), 0o755);

await cp(resolve(dist, "browser.js"), resolve(dist, "paperless.js"));

await build({
  entryPoints: [resolve(root, "src/browser.ts")],
  bundle: true,
  format: "iife",
  globalName: "PaperlessOpenIntegration",
  outfile: resolve(dist, "paperless.iife.js"),
  platform: "browser",
  sourcemap: false,
  target: "es2020"
});

await cp(resolve(root, "src/styles/paperless.css"), resolve(dist, "paperless.css"));
await cp(resolve(root, "src/styles/settings.css"), resolve(dist, "settings.css"));
await mkdir(openSansDist, { recursive: true });

for (const weight of openSansWeights) {
  for (const style of openSansStyles) {
    const fileName = `open-sans-latin-${weight}-${style}.woff2`;
    await cp(resolve(openSansFiles, fileName), resolve(openSansDist, fileName));
  }
}

await cp(
  resolve(root, "node_modules/@fontsource/open-sans/LICENSE"),
  resolve(openSansDist, "open-sans-LICENSE.txt")
);

const previewHtmlSource = await readFile(resolve(root, "src/previewHtml.ts"), "utf8");
const previewCssMatch = previewHtmlSource.match(/<style>\n([\s\S]*?)\n    <\/style>/);
if (!previewCssMatch) {
  throw new Error("Could not extract preview CSS from src/previewHtml.ts");
}

await writeFile(
  resolve(dist, "preview.css"),
  `${previewCssMatch[1].replace(/^      /gm, "").trim()}\n`
);

const configPath = resolve(root, "tsconfig.json");
const configFile = ts.readConfigFile(configPath, ts.sys.readFile);

if (configFile.error) {
  throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
}

const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root, {
  declaration: true,
  declarationMap: true,
  emitDeclarationOnly: true,
  noEmit: false,
  outDir: dist
});

const sourceFiles = parsed.fileNames.filter((fileName) => fileName.includes("/src/"));
const program = ts.createProgram(sourceFiles, parsed.options);
const result = program.emit();
const diagnostics = ts.getPreEmitDiagnostics(program).concat(result.diagnostics);

if (diagnostics.length > 0) {
  const formatted = ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => root,
    getNewLine: () => "\n"
  });
  throw new Error(formatted);
}
