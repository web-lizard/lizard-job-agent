import browser from "webextension-polyfill";
import { genericAdapter } from "../adapters/generic.adapter";
import { hhAdapter } from "../adapters/hh.adapter";
import type { SiteAdapter } from "../adapters/site-adapter";
import {
  MESSAGE_TYPES,
  mergeFillResults,
  type ContentMessage,
} from "../shared/messages";
import { logger } from "../shared/logger";
import { executeFillPlan } from "./fill-plan-executor";
import { scanPage } from "./page-scanner";

const style = document.createElement("style");
style.textContent = `
  .lja-field-filled { outline: 3px solid #74d300 !important; outline-offset: 2px !important; }
  .lja-field-review { outline: 3px solid #f4b942 !important; outline-offset: 2px !important; }
  .lja-field-error { outline: 3px solid #ee5166 !important; outline-offset: 2px !important; }
`;
(document.head || document.documentElement).appendChild(style);

const adapters: SiteAdapter[] = [hhAdapter, genericAdapter];

function currentAdapter(): SiteAdapter {
  const url = new URL(window.location.href);
  return adapters.find((adapter) => adapter.matches(url)) ?? genericAdapter;
}

browser.runtime.onMessage.addListener((message: unknown) => {
  const contentMessage = message as ContentMessage;
  const adapter = currentAdapter();

  if (contentMessage.type === MESSAGE_TYPES.DETECT_PAGE) {
    return adapter.detectPage();
  }

  if (contentMessage.type === MESSAGE_TYPES.DESCRIBE_PAGE) {
    return scanPage();
  }

  if (contentMessage.type === MESSAGE_TYPES.EXECUTE_FILL_PLAN) {
    return executeFillPlan(
      contentMessage.plan,
      contentMessage.doNotOverwrite,
    );
  }

  if (contentMessage.type === MESSAGE_TYPES.FILL_PAGE) {
    logger.info("fill_started", { adapter: adapter.id });
    return (async () => {
      const profileResult = await adapter.fillProfile(
        contentMessage.profile,
        contentMessage.doNotOverwrite,
      );
      const experienceResult = await adapter.fillExperience(
        contentMessage.profile.experience,
        contentMessage.doNotOverwrite,
      );
      const merged = mergeFillResults(profileResult, experienceResult);
      logger.info("fill_finished", {
        adapter: adapter.id,
        filled: merged.filled.length,
        skipped: merged.skipped.length,
        failed: merged.failed.length,
      });
      return merged;
    })();
  }

  return undefined;
});
