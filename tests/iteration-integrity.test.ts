import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(path), "utf8");
}

describe("целостность активной версии расширения", () => {
  it("использует постоянную панель и стабильные точки входа", () => {
    const manifest = JSON.parse(read("manifest.json"));
    expect(manifest.version).toBe("0.10.0");
    expect(manifest.action.default_popup).toBeUndefined();
    expect(manifest.background.scripts).toEqual(["background.js"]);
    expect(manifest.content_scripts[0].js).toEqual(["content.js"]);
    expect(manifest.content_scripts[0].all_frames).toBe(true);
    expect(manifest.content_scripts[0].matches).toContain("https://docs.google.com/forms/*");
    expect(manifest.host_permissions).toContain("https://docs.google.com/forms/*");
    expect(manifest.options_ui.page).toBe("options.html");

    for (const path of [
      "popup.html",
      "popup.js",
      "popup.css",
      "background.js",
      "content.js",
      "options.html",
      "options.js",
      "options.css",
      "resume.example.json",
    ]) {
      expect(existsSync(resolve(path)), path).toBe(true);
    }
  });

  it("shows an unmistakable build marker and removes the old safe popup text", () => {
    const popup = read("popup.html");
    const popupScript = read("popup.js");
    expect(popup).toContain("ИТЕРАЦИЯ 10");
    expect(popup).toContain("I10-20260803");
    expect(popup).toContain("Обновить состояние страницы");
    expect(popup).toContain("Заполнить Google-форму");
    expect(popup).toContain("Заполнить вопросы работодателя");
    expect(popupScript).toContain("LJA_I10_FILL_GOOGLE_FORM");
    expect(popupScript).toContain("LJA_I10_FILL_HH_QUESTIONNAIRE");
    expect(popup).not.toContain("Безопасный аварийный popup без Vue");
    expect(popupScript).toContain('const BUILD_ID = "I10-20260803"');
    expect(read("content.js")).toContain('const BUILD_ID = "I10-20260803"');
    expect(read("background.js")).toContain('const BUILD_ID = "I10-20260803"');
    expect(read("background.js")).toContain('browser.windows.create({');
  });
});
