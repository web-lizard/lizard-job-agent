import browser from "webextension-polyfill";

const RESUME_TEXT_KEY = "resumeSourceText";
const RESUME_PARSED_AT_KEY = "resumeParsedAt";

export async function getResumeText(): Promise<string> {
  const stored = await browser.storage.local.get(RESUME_TEXT_KEY);
  return typeof stored[RESUME_TEXT_KEY] === "string"
    ? stored[RESUME_TEXT_KEY]
    : "";
}

export async function saveResumeText(text: string): Promise<void> {
  await browser.storage.local.set({ [RESUME_TEXT_KEY]: text });
}

export async function markResumeParsed(): Promise<void> {
  await browser.storage.local.set({
    [RESUME_PARSED_AT_KEY]: new Date().toISOString(),
  });
}

export async function getResumeParsedAt(): Promise<string> {
  const stored = await browser.storage.local.get(RESUME_PARSED_AT_KEY);
  return typeof stored[RESUME_PARSED_AT_KEY] === "string"
    ? stored[RESUME_PARSED_AT_KEY]
    : "";
}

export async function clearResumeData(): Promise<void> {
  await browser.storage.local.remove([RESUME_TEXT_KEY, RESUME_PARSED_AT_KEY]);
}

