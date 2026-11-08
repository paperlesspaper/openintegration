// @vitest-environment node
import fs from "node:fs";
import http from "node:http";
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { it } from "vitest";
import { installEmbeddedRenderBridge } from "../src/renderEmbedded";

it.skipIf(
  !process.env.LAYOUT_PROVIDER_DIR || process.env.LAYOUT_BROWSER_TESTS !== "1"
)(
  "protects SDK and legacy listeners in the shipped provider bundle",
  async () => {
    const bundle = fs.readFileSync(
      process.env.LAYOUT_PROVIDER_DIR + "/public/paperless.iife.js",
      "utf8"
    );
    const bridge = installEmbeddedRenderBridge.toString();
    const listen = (server) =>
      new Promise((resolve) =>
        server.listen(0, "127.0.0.1", () =>
          resolve(`http://127.0.0.1:${server.address().port}`)
        )
      );
    let origin;
    const attacker = http.createServer((req, res) => {
      res.setHeader("Content-Type", "text/html");
      res.end(
        `<script>addEventListener('message',()=>parent.frames[0].postMessage({type:'INIT',data:{marker:'FORGED_BY_OTHER_ORIGIN'}},'*'));</script>`
      );
    });
    const attackOrigin = await listen(attacker);
    const server = http.createServer((req, res) => {
      res.setHeader(
        "Content-Type",
        req.url === "/runtime.js"
          ? "text/javascript; charset=utf-8"
          : "text/html; charset=utf-8"
      );
      if (req.url === "/runtime.js") return res.end(bundle);
      if (req.url === "/legacy")
        return res.end(
          '<div id="website-has-loading-element"></div><div id="website-has-loaded"></div><main>Already rendered countdown</main>'
        );
      if (req.url === "/victim")
        return res.end(
          `<script src="/runtime.js"></script><script>PaperlessOpenIntegration.waitForPayload({timeoutMs:-1,onUpdate:p=>window.received=p}).then(p=>window.received=p);addEventListener('message',e=>window.legacyReceived=e.data);</script>`
        );
      res.end("<html><body></body></html>");
    });
    origin = await listen(server);
    const browser = await puppeteer.launch({
      executablePath:
        process.env.CHROME_BIN ||
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      headless: true,
    });
    try {
      const page = await browser.newPage();
      await page.evaluateOnNewDocument(
        bridge + ";installEmbeddedRenderBridge();"
      );
      await page.goto(origin);
      await page.evaluate((origin) => {
        window.statuses = [];
        window.hello = false;
        addEventListener("message", (event) => {
          if (event.data.type === "PAPERLESS_RENDER_STATUS")
            window.statuses.push(event.data);
          if (event.data.type === "PAPERLESS_RENDER_HELLO") {
            window.hello = true;
            event.source.postMessage(
              {
                type: "INIT",
                renderId: "r",
                regionId: "legacy",
                data: { kind: "days-left" },
              },
              origin
            );
          }
        });
        const frame = document.createElement("iframe");
        frame.name =
          "paperless-slot:" +
          JSON.stringify({
            renderId: "r",
            regionId: "legacy",
            parentOrigin: origin,
          });
        frame.src = "/legacy";
        document.body.append(frame);
      }, origin);
      await page.waitForFunction(
        () => window.hello && window.statuses.length === 1
      );
      const legacy = await page.evaluate(() => ({
        loaded: !!frames[0].document.querySelector("#website-has-loaded"),
        status:
          frames[0].document.documentElement.dataset.paperlessRenderStatus,
        notifications: window.statuses.length,
      }));
      assert.deepEqual(legacy, { loaded: true, notifications: 1 });
      await page.close();

      const attackPage = await browser.newPage();
      const errors = [];
      attackPage.on("pageerror", (e) => errors.push(e.message));
      await attackPage.goto(origin);
      await attackPage.evaluate(
        ({ origin, attackOrigin }) => {
          const victim = document.createElement("iframe");
          victim.name =
            "paperless-slot:" +
            JSON.stringify({
              renderId: "legitimate-render",
              regionId: "calendar",
              parentOrigin: origin,
            });
          victim.src = "/victim";
          victim.setAttribute("sandbox", "allow-scripts allow-same-origin");
          document.body.append(victim);
          const hostile = document.createElement("iframe");
          hostile.src = attackOrigin;
          hostile.setAttribute("sandbox", "allow-scripts allow-same-origin");
          document.body.append(hostile);
        },
        { origin, attackOrigin }
      );
      await attackPage.waitForFunction(() => frames.length === 2);
      await Promise.all(
        attackPage
          .frames()
          .filter((f) => f !== attackPage.mainFrame())
          .map((f) =>
            f.waitForFunction(() => document.readyState === "complete")
          )
      );
      const victimFrame = attackPage
        .frames()
        .find((f) => f.url().endsWith("/victim"));
      await victimFrame.waitForFunction(() => window.PaperlessOpenIntegration, {
        timeout: 5000,
      });
      const hostileFrame = attackPage
        .frames()
        .find((f) => f.url().startsWith(attackOrigin));
      await hostileFrame.evaluate(() =>
        parent.frames[0].postMessage(
          {
            type: "INIT",
            renderId: "legitimate-render",
            regionId: "calendar",
            data: { marker: "FORGED_BY_OTHER_ORIGIN" },
          },
          "*"
        )
      );
      await victimFrame.evaluate(() =>
        window.postMessage(
          {
            type: "INIT",
            renderId: "legitimate-render",
            regionId: "calendar",
            data: { marker: "WRONG_SOURCE" },
          },
          location.origin
        )
      );
      // Round trip through the hostile frame ensures its earlier forged message was delivered.
      await hostileFrame.evaluate(() => new Promise((r) => setTimeout(r, 100)));
      assert.deepEqual(
        await victimFrame.evaluate(() => ({
          received: window.received,
          legacy: window.legacyReceived,
        })),
        {}
      );
      for (const patch of [{ renderId: "old" }, { regionId: "wrong" }]) {
        await attackPage.evaluate(
          (patch) =>
            frames[0].postMessage(
              {
                type: "INIT",
                renderId: "legitimate-render",
                regionId: "calendar",
                data: { marker: "STALE" },
                ...patch,
              },
              location.origin
            ),
          patch
        );
      }
      await hostileFrame.evaluate(() => new Promise((r) => setTimeout(r, 100)));
      assert.equal(
        await victimFrame.evaluate(() => window.received),
        undefined
      );
      await attackPage.evaluate(() =>
        frames[0].postMessage(
          {
            type: "INIT",
            renderId: "legitimate-render",
            regionId: "calendar",
            data: { marker: "TRUSTED" },
          },
          location.origin
        )
      );
      await victimFrame.waitForFunction(() => window.received, {
        timeout: 5000,
      });
      const result = await victimFrame.evaluate(() => ({
        payload: window.received,
        settings: window.PaperlessOpenIntegration.getSettings({
          settings: { location: "Hamburg" },
          meta: { language: "de", pluginSettings: { location: "Hamburg" } },
        }),
      }));
      assert.equal(result.payload.marker, "TRUSTED");
      assert.equal(
        await victimFrame.evaluate(() => window.legacyReceived.data.marker),
        "TRUSTED"
      );
      assert.equal(
        await victimFrame.evaluate(
          () =>
            typeof window.PaperlessOpenIntegration.bootCalendarApiIntegration
        ),
        "function"
      );
      assert.deepEqual(errors, []);
      assert.deepEqual(result.settings, { location: "Hamburg" });
    } finally {
      await browser.close();
      for (const current of [server, attacker]) {
        current.closeAllConnections();
        await new Promise((r) => current.close(r));
      }
    }
  },
  30_000
);
