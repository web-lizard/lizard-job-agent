import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FillPlan } from "../src/ai/ai.types";
import { executeFillPlan } from "../src/content/fill-plan-executor";
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

describe("AI FillPlan executor", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("can change a false checkbox despite overwrite protection", async () => {
    document.body.innerHTML = `
      <label for="current">Работаю сейчас</label>
      <input id="current" name="current" type="checkbox" />
    `;
    const checkbox = document.querySelector("input") as HTMLInputElement;
    visible(checkbox);
    const field = scanPage().fields[0]!;
    const plan: FillPlan = {
      actions: [
        {
          fieldId: field.fieldId,
          action: "setCheckbox",
          value: true,
          sourcePath: "experience[0].currentlyWorking",
          confidence: 0.99,
          explanation: "Работаю сейчас",
        },
      ],
      warnings: [],
    };

    const result = await executeFillPlan(plan, true);

    expect(checkbox.checked).toBe(true);
    expect(result.fillResult.filled).toHaveLength(1);
  });

  it("rejects a source path outside the profile whitelist", async () => {
    document.body.innerHTML = `<input name="company" />`;
    const input = document.querySelector("input") as HTMLInputElement;
    visible(input);
    const field = scanPage().fields[0]!;
    const plan: FillPlan = {
      actions: [
        {
          fieldId: field.fieldId,
          action: "setText",
          value: "bad",
          sourcePath: "window.location",
          confidence: 1,
          explanation: "Недопустимо",
        },
      ],
      warnings: [],
    };

    const result = await executeFillPlan(plan, true);

    expect(input.value).toBe("");
    expect(result.fillResult.failed[0]?.reason).toBe("Недопустимый sourcePath");
  });
});

