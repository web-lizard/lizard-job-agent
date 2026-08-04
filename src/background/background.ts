import browser from "webextension-polyfill";
import {
  deleteAiKey,
  getAiSettings,
  getSafeAiStatus,
  markAiConnected,
  saveAiSettings,
} from "../ai/ai-settings.storage";
import {
  cancelDeepSeekRequest,
  createFillPlan,
  parseResume,
  testConnection,
} from "../ai/deepseek-client";
import { DeepSeekClientError } from "../ai/ai.types";
import { getProfile, saveProfile } from "../profile/profile.storage";
import {
  markResumeParsed,
  saveResumeText,
} from "../profile/resume.storage";
import { logger } from "../shared/logger";
import {
  MESSAGE_TYPES,
  type AiResponse,
  type BackgroundMessage,
} from "../shared/messages";

browser.runtime.onInstalled.addListener(async ({ reason }) => {
  const profile = await getProfile();
  await saveProfile(profile);
  logger.info("extension_installed", { reason });
});

function isExtensionSender(sender: browser.Runtime.MessageSender): boolean {
  return Boolean(sender.url?.startsWith(browser.runtime.getURL("")));
}

function success<T>(data: T): AiResponse<T> {
  return { ok: true, data };
}

function failure(error: unknown): AiResponse<never> {
  return {
    ok: false,
    error:
      error instanceof Error
        ? error.message
        : "Неизвестная ошибка фонового процесса.",
    code: error instanceof DeepSeekClientError ? error.code : undefined,
  };
}

browser.runtime.onMessage.addListener(
  async (
    rawMessage: unknown,
    sender: browser.Runtime.MessageSender,
  ): Promise<unknown> => {
    const message = rawMessage as BackgroundMessage;
    if (!Object.values(MESSAGE_TYPES).includes(message.type)) return undefined;

    // Secrets and AI requests are accepted only from extension-owned pages.
    // A content script can execute an already validated FillPlan, but cannot
    // retrieve the key or invoke the API itself.
    if (!isExtensionSender(sender)) return failure(new Error("Доступ запрещён."));

    try {
      switch (message.type) {
        case MESSAGE_TYPES.AI_GET_SETTINGS:
          return success(await getAiSettings());
        case MESSAGE_TYPES.AI_SAVE_SETTINGS:
          await saveAiSettings(message.settings);
          return success(await getSafeAiStatus());
        case MESSAGE_TYPES.AI_DELETE_KEY:
          await deleteAiKey();
          return success(await getSafeAiStatus());
        case MESSAGE_TYPES.AI_GET_STATUS:
          return success(await getSafeAiStatus());
        case MESSAGE_TYPES.AI_TEST_CONNECTION: {
          await saveAiSettings(message.settings);
          const result = await testConnection(
            message.settings,
            message.requestId,
          );
          if (result.success) {
            await markAiConnected(result.model ?? message.settings.model);
          }
          return success(result);
        }
        case MESSAGE_TYPES.AI_PARSE_RESUME: {
          await saveResumeText(message.resumeText);
          const settings = await getAiSettings();
          const profile = await parseResume(
            settings,
            message.resumeText,
            message.requestId,
          );
          await saveProfile(profile);
          await markResumeParsed();
          return success(profile);
        }
        case MESSAGE_TYPES.AI_CREATE_FILL_PLAN: {
          const settings = await getAiSettings();
          return success(
            await createFillPlan(
              settings,
              message.profile,
              message.page,
              message.requestId,
            ),
          );
        }
        case MESSAGE_TYPES.AI_CANCEL_REQUEST:
          return success(cancelDeepSeekRequest(message.requestId));
        default:
          return undefined;
      }
    } catch (error) {
      logger.error("background_ai_error", {
        code: error instanceof DeepSeekClientError ? error.code : "unknown",
      });
      return failure(error);
    }
  },
);
