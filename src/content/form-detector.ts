import type { PageDetectionResult } from "../shared/messages";
import {
  fieldAliases,
  findBestField,
  getFillableElements,
  type FieldKey,
} from "./field-matcher";

const keys = Object.keys(fieldAliases) as FieldKey[];

export function detectForm(adapterId: string): PageDetectionResult {
  const matched = new Set<Element>();
  for (const key of keys) {
    const match = findBestField(key, document, 0.72, matched);
    if (match) matched.add(match.element);
  }
  return {
    supported: getFillableElements().length > 0,
    adapterId,
    fieldCount: matched.size,
    pageTitle: document.title,
  };
}

