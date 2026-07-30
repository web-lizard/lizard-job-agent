import type { FillableElement } from "./field-matcher";

function nativeSetter(element: HTMLInputElement | HTMLTextAreaElement): void {
  const prototype =
    element instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(element, element.value);
}

export function setNativeValue(
  element: FillableElement,
  value: string,
): void {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const prototype =
      element instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : HTMLTextAreaElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    setter?.call(element, value);
    nativeSetter(element);
  } else if (element instanceof HTMLSelectElement) {
    element.value = value;
  } else if (element.isContentEditable) {
    element.textContent = value;
  }

  element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
}

export function setChecked(element: HTMLInputElement, checked: boolean): void {
  if (element.checked !== checked) element.click();
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

