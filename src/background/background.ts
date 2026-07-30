import browser from "webextension-polyfill";
import { getProfile, saveProfile } from "../profile/profile.storage";
import { logger } from "../shared/logger";

browser.runtime.onInstalled.addListener(async ({ reason }) => {
  const profile = await getProfile();
  await saveProfile(profile);
  logger.info("extension_installed", { reason });
});

