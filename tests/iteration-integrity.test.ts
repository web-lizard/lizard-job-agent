import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(path), "utf8");
}

describe("iteration 06 package integrity", () => {
  it("uses only versioned iteration 06 entry points", () => {
    const manifest = JSON.parse(read("manifest.json"));
    expect(manifest.version).toBe("0.6.0");
    expect(manifest.action.default_popup).toBe("popup-i06.html");
    expect(manifest.background.scripts).toEqual(["background-i06.js"]);
    expect(manifest.content_scripts[0].js).toEqual(["content-i06.js"]);
    expect(manifest.content_scripts[0].all_frames).toBe(true);
    expect(manifest.options_ui.page).toBe("options-i06.html");

    for (const path of [
      "popup-i06.html",
      "popup-i06.js",
      "popup-i06.css",
      "background-i06.js",
      "content-i06.js",
      "options-i06.html",
      "options-i06.js",
      "options-i06.css",
      "resume.json",
    ]) {
      expect(existsSync(resolve(path)), path).toBe(true);
    }
  });

  it("keeps the actually loaded dist package identical to root", () => {
    for (const path of [
      "manifest.json",
      "popup-i06.html",
      "popup-i06.js",
      "popup-i06.css",
      "background-i06.js",
      "content-i06.js",
      "options-i06.html",
      "options-i06.js",
      "options-i06.css",
      "resume.json",
    ]) {
      expect(read(`dist/${path}`), path).toBe(read(path));
    }
  });

  it("shows an unmistakable build marker and removes the old safe popup text", () => {
    const popup = read("popup-i06.html");
    const popupScript = read("popup-i06.js");
    expect(popup).toContain("ИТЕРАЦИЯ 06");
    expect(popup).toContain("I06-20260802");
    expect(popup).not.toContain("Безопасный аварийный popup без Vue");
    expect(popupScript).toContain('const BUILD_ID = "I06-20260802"');
    expect(read("content-i06.js")).toContain('const BUILD_ID = "I06-20260802"');
    expect(read("background-i06.js")).toContain('const BUILD_ID = "I06-20260802"');
  });
});
