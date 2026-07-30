export function normalizeText(value: string): string {
  return value
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/[•·:*_—–|()[\]{}<>!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function comparableText(value: string): string {
  return normalizeText(value).replace(/[^\p{L}\p{N}\s]/gu, "");
}

