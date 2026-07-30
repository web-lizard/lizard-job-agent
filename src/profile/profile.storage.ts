import browser from "webextension-polyfill";
import { defaultPreferences, emptyProfile } from "./profile.defaults";
import type { ExtensionPreferences, JobProfile } from "./profile.types";

const PROFILE_KEY = "jobProfile";
const PREFERENCES_KEY = "preferences";

export async function getProfile(): Promise<JobProfile> {
  const stored = await browser.storage.local.get(PROFILE_KEY);
  return (stored[PROFILE_KEY] as JobProfile | undefined) ?? emptyProfile();
}

export async function saveProfile(profile: JobProfile): Promise<void> {
  await browser.storage.local.set({ [PROFILE_KEY]: profile });
}

export async function clearProfile(): Promise<void> {
  await browser.storage.local.remove(PROFILE_KEY);
}

export async function getPreferences(): Promise<ExtensionPreferences> {
  const stored = await browser.storage.local.get(PREFERENCES_KEY);
  return {
    ...defaultPreferences,
    ...(stored[PREFERENCES_KEY] as Partial<ExtensionPreferences> | undefined),
  };
}

export async function savePreferences(
  preferences: ExtensionPreferences,
): Promise<void> {
  await browser.storage.local.set({ [PREFERENCES_KEY]: preferences });
}

