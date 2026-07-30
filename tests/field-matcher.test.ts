import { beforeEach, describe, expect, it } from "vitest";
import {
  describeElement,
  matchElement,
} from "../src/content/field-matcher";
import { normalizeText } from "../src/shared/normalize-text";

describe("normalizeText", () => {
  it("normalizes Russian labels and decorative characters", () => {
    expect(normalizeText("  Обязанности и достижения: Ёлка • ")).toBe(
      "обязанности и достижения елка",
    );
  });
});

describe("field matcher", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("uses label, placeholder and data-qa together", () => {
    document.body.innerHTML = `
      <label for="company-field">Компания:</label>
      <input id="company-field" data-qa="resume-experience-company" placeholder="Название компании" />
    `;
    const input = document.querySelector("input") as HTMLInputElement;
    const details = describeElement(input);
    const match = matchElement(input, "company");
    expect(details.descriptor).toContain("название компании");
    expect(match.score).toBeGreaterThanOrEqual(0.9);
  });

  it("does not confuse an unrelated field with company", () => {
    document.body.innerHTML = `<input aria-label="Электронная почта" name="email" />`;
    const input = document.querySelector("input") as HTMLInputElement;
    expect(matchElement(input, "company").score).toBe(0);
    expect(matchElement(input, "email").score).toBeGreaterThanOrEqual(0.9);
  });

  it("separates residence city from an experience region field", () => {
    document.body.innerHTML = `<input aria-label="Город или регион" />`;
    const input = document.querySelector("input") as HTMLInputElement;
    expect(matchElement(input, "city").score).toBeLessThan(0.72);
    expect(matchElement(input, "experienceCity").score).toBeGreaterThanOrEqual(0.9);
  });
});
