import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export interface ScaffoldOptions {
  targetDir: string;
  name?: string;
  force?: boolean;
  api?: boolean;
}

export interface ScaffoldResult {
  targetDir: string;
  files: string[];
}

interface ScaffoldFile {
  path: string;
  body: string;
}

function titleCase(value: string): string {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function safeNameFromDir(targetDir: string): string {
  const name = targetDir.split(/[\\/]/).filter(Boolean).at(-1) ?? "OpenIntegration";
  return titleCase(name) || "OpenIntegration";
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function configTemplate(name: string): string {
  return json({
    name,
    version: "0.1.0",
    description: `Displays ${name} on a paperlesspaper eInk display.`,
    renderPage: "./render.html",
    language: ["de", "en"],
    nativeSettings: {
      title: name,
      limit: 5
    },
    formSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          title: "Title",
          default: name
        },
        limit: {
          type: "integer",
          title: "Item limit",
          minimum: 1,
          maximum: 12,
          default: 5
        }
      }
    }
  });
}

function readmeTemplate(name: string): string {
  return `# ${name}

paperlesspaper OpenIntegration scaffold.

## Develop

\`\`\`sh
paperlesspaper-openintegration check ./config.json
paperlesspaper-openintegration dev ./config.json
paperlesspaper-openintegration render ./config.json --viewport 800x480 --output render.png
\`\`\`

## Files

- \`config.json\`: integration manifest, defaults, and generated settings form.
- \`render.html\`: static render page. It must call \`markReady()\` when the frame is complete.
- \`languages/*.json\`: localized copy loaded from the host-selected payload language.
- \`api/data.js\`: optional local API handler used by the dev server.
`;
}

function renderTemplate({ api, name }: { api: boolean; name: string }): string {
  const loadData = api
    ? `const url = new URL("./api/data", window.location.href);
        url.searchParams.set("title", settings.title);
        url.searchParams.set("limit", settings.limit);

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(\`API request failed: \${response.status}\`);
        }

        const data = await response.json();`
    : `const data = {
          title: settings.title,
          items: (Array.isArray(messages.items)
            ? messages.items.filter((item) => typeof item === "string")
            : [
                "Replace this starter content with your integration data.",
                "Keep text concise and high contrast for eInk.",
                "Run the CLI render command for both landscape and portrait."
              ]).slice(0, settings.limit)
        };`;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${name}</title>
    <link rel="stylesheet" href="./paperless.css" />
    <style>
      html,
      body {
        margin: 0;
        width: 100%;
        height: 100%;
      }

      .screen {
        gap: 18px;
        padding: 28px;
      }

      .items {
        display: grid;
        flex: 1;
        gap: 0;
        min-height: 0;
        border-top: 2px solid currentColor;
      }

      .item {
        display: flex;
        align-items: center;
        min-height: 0;
        border-bottom: 2px solid currentColor;
        font-size: 22px;
        line-height: 1.1;
      }

      @media (orientation: portrait) {
        .screen {
          padding: 22px;
        }
      }
    </style>
  </head>
  <body>
    <div id="website-has-loading-element"></div>

    <main id="app" class="pp-screen screen">
      <p>Loading...</p>
    </main>

    <script type="module">
      import {
        waitForPayload,
        getSettings,
        getQuerySettings,
        mergeSettings,
        loadLanguageJson,
        applyColorThemeFromQuery,
        markReady,
        markError,
        fitAllText,
        fitToScreen,
        escapeHtml
      } from "./paperless.js";

      const app = document.querySelector("#app");

      try {
        const payload = await waitForPayload({ timeoutMs: 500 });
        const { messages } = await loadLanguageJson(payload);
        applyColorThemeFromQuery({ defaultTheme: "light" });

        const settings = mergeSettings(
          { title: ${JSON.stringify(name)}, limit: 5 },
          getSettings(payload),
          getQuerySettings()
        );
        settings.limit = Math.max(1, Math.min(12, Number(settings.limit) || 5));

        ${loadData}

        const items = Array.isArray(data.items) ? data.items.slice(0, settings.limit) : [];
        const footer = typeof messages.footer === "string" ? messages.footer : "";
        app.innerHTML = \`
          <header class="pp-header">
            <div>
              <h1 class="pp-title pp-fit">\${escapeHtml(data.title || settings.title)}</h1>
            </div>
          </header>

          <section class="items">
            \${items
              .map((item) => \`<div class="item pp-fit">\${escapeHtml(item)}</div>\`)
              .join("")}
          </section>

          \${footer ? \`<footer class="pp-footer">\${escapeHtml(footer)}</footer>\` : ""}
        \`;

        await document.fonts?.ready;
        fitAllText(".pp-fit", { min: 12, max: 72, step: 1, tolerance: 3, lineBreak: true });
        fitToScreen(app);
        markReady();
      } catch (error) {
        markError(error);
      }
    </script>
  </body>
</html>
`;
}

function apiTemplate(name: string): string {
  return `function toInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

export default async function handler({ query }) {
  const title = String(query.title || ${JSON.stringify(name)});
  const limit = Math.max(1, Math.min(12, toInteger(query.limit, 5)));

  return {
    title,
    items: [
      "Fetch or compute real integration data in api/data.js.",
      "Return plain JSON that render.html can display.",
      "Clamp user settings before calling external APIs.",
      "Keep copy short enough for an eInk frame.",
      "Call markReady only after images and fonts are settled."
    ].slice(0, limit)
  };
}
`;
}

function languageTemplate(language: "de" | "en", name: string): string {
  return json(
    language === "de"
      ? {
          footer: "Text aus languages/de.json",
          items: [
            "Ersetze diesen Starter-Inhalt durch deine Integrationsdaten.",
            "Halte Text kurz und kontrastreich fuer eInk.",
            "Teste die CLI-Renderausgabe im Hoch- und Querformat."
          ],
          title: name
        }
      : {
          footer: "Text from languages/en.json",
          items: [
            "Replace this starter content with your integration data.",
            "Keep text concise and high contrast for eInk.",
            "Run the CLI render command for both landscape and portrait."
          ],
          title: name
        }
  );
}

export function buildScaffoldFiles(options: ScaffoldOptions): ScaffoldFile[] {
  const name = options.name?.trim() || safeNameFromDir(options.targetDir);
  const api = options.api ?? true;
  const files: ScaffoldFile[] = [
    { path: "config.json", body: configTemplate(name) },
    { path: "render.html", body: renderTemplate({ api, name }) },
    { path: "languages/de.json", body: languageTemplate("de", name) },
    { path: "languages/en.json", body: languageTemplate("en", name) },
    { path: "README.md", body: readmeTemplate(name) }
  ];

  if (api) {
    files.push({ path: "api/data.js", body: apiTemplate(name) });
  }

  return files;
}

export async function scaffoldIntegration(options: ScaffoldOptions): Promise<ScaffoldResult> {
  const targetDir = resolve(options.targetDir);
  const files = buildScaffoldFiles(options);
  const written: string[] = [];

  await mkdir(targetDir, { recursive: true });

  for (const file of files) {
    const filePath = join(targetDir, file.path);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, file.body, { flag: options.force ? "w" : "wx" });
    written.push(filePath);
  }

  return {
    files: written,
    targetDir
  };
}
