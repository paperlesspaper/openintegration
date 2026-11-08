import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderOfTheDayLayout, waitForOfTheDayImage } from "../src/ofTheDay";

beforeEach(() => { document.body.innerHTML = '<main id="app"></main>'; });

describe("illustrated daily cards", () => {
  it("escapes titles, facts and metadata, and keeps source copy outside the title column", () => {
    const layout = renderOfTheDayLayout({
      title: '<img src=x onerror="alert(1)">',
      signature: "A complete description.",
      meta: [{ key: "date", value: "05 Sep" }, { key: "source", value: "<script>source</script>" }],
      facts: [{ label: "<b>Label</b>", value: "<i>Value</i>" }]
    });
    expect(layout.title?.textContent).toBe('<img src=x onerror="alert(1)">');
    expect(layout.target.querySelectorAll("img")).toHaveLength(1);
    expect(layout.target.querySelector("script, b, i")).toBeNull();
    expect(layout.header?.textContent).not.toContain("source");
    expect(layout.target.querySelector(".pp-otd-footer")?.textContent).toContain("<script>source</script>");
  });

  it("replaces empty / header-free state on subsequent payloads without fallback facts", () => {
    renderOfTheDayLayout({ title: "First", showHeader: false, facts: [{ label: "Hidden", visible: false }] });
    const layout = renderOfTheDayLayout({ title: "Second", textSize: "big", facts: [{ label: "Height", value: "100 m" }] });
    expect(layout.target.classList.contains("pp-otd--hide-header")).toBe(false);
    expect(layout.target.classList.contains("pp-otd--no-facts")).toBe(false);
    expect(layout.target.classList.contains("pp-otd--text-big")).toBe(true);
    expect(layout.facts).toHaveLength(1);
    expect(layout.target.textContent).not.toContain("First");
  });

  it("rejects an image that already failed instead of waiting forever for a past error event", async () => {
    const image = document.createElement("img");
    Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: 0 } });
    await expect(waitForOfTheDayImage(image)).rejects.toThrow("Image could not load");
  });

  it("waits for decoding of a cached image before declaring the layout ready", async () => {
    const image = document.createElement("img");
    let finish!: () => void;
    image.decode = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: 100 } });
    let done = false;
    const ready = waitForOfTheDayImage(image).then(() => { done = true; });
    await Promise.resolve();
    expect(done).toBe(false);
    finish(); await ready;
    expect(done).toBe(true);
  });
});
