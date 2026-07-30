import { beforeEach, describe, expect, it, vi } from "vitest";
import { fillMatchedField } from "../src/content/field-filler";

function visible(element: HTMLElement): void {
  element.getBoundingClientRect = vi.fn(() => ({
    width: 240,
    height: 32,
    top: 0,
    left: 0,
    right: 240,
    bottom: 32,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  }));
}

describe("field filler safety", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("does not overwrite a populated field by default", async () => {
    document.body.innerHTML = `<input name="company" value="Уже заполнено" />`;
    const input = document.querySelector("input") as HTMLInputElement;
    visible(input);

    const result = await fillMatchedField("company", "Новая компания", {
      doNotOverwrite: true,
    });

    expect(input.value).toBe("Уже заполнено");
    expect(result.filled).toHaveLength(0);
    expect(result.skipped[0]?.reason).toBe("Поле уже заполнено");
  });

  it("dispatches browser-form events after filling", async () => {
    document.body.innerHTML = `<input name="company" />`;
    const input = document.querySelector("input") as HTMLInputElement;
    visible(input);
    const inputEvent = vi.fn();
    const changeEvent = vi.fn();
    const blurEvent = vi.fn();
    input.addEventListener("input", inputEvent);
    input.addEventListener("change", changeEvent);
    input.addEventListener("blur", blurEvent);

    const result = await fillMatchedField("company", "Lizard Labs", {
      doNotOverwrite: true,
    });

    expect(input.value).toBe("Lizard Labs");
    expect(result.filled).toHaveLength(1);
    expect(inputEvent).toHaveBeenCalledOnce();
    expect(changeEvent).toHaveBeenCalledOnce();
    expect(blurEvent).toHaveBeenCalledOnce();
  });
});
