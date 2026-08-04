import { beforeEach, describe, expect, it, vi } from "vitest";
import { scanPage } from "../src/content/page-scanner";

function visible(element: HTMLElement): void {
  element.getBoundingClientRect = vi.fn(() => ({
    width: 180,
    height: 30,
    top: 0,
    left: 0,
    right: 180,
    bottom: 30,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  }));
}

describe("AI page scanner", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("collects form metadata without HTML or password values", () => {
    document.body.innerHTML = `
      <label for="company">Компания</label>
      <input id="company" name="company" placeholder="Название" value="" required />
      <input type="password" value="secret" />
      <button type="button">Добавить место работы</button>
      <button type="submit">Сохранить</button>
    `;
    document.querySelectorAll<HTMLElement>("input, button").forEach(visible);

    const page = scanPage();

    expect(page.fields.some((field) => field.name === "company")).toBe(true);
    expect(page.fields.some((field) => field.currentValue === "secret")).toBe(false);
    expect(page.fields.some((field) => field.label.includes("Добавить"))).toBe(true);
    expect(page.fields.some((field) => field.label.includes("Сохранить"))).toBe(false);
    expect(JSON.stringify(page)).not.toContain("<input");
  });
});

