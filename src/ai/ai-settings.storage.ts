import browser from "webextension-polyfill";
import type { AiSettings, SafeAiStatus } from "./ai.types";

const STORAGE_KEY = "deepSeekSettings";

interface StoredAiSettings extends AiSettings {
  lastConnectedAt: string;
  connectedModel: string;
}

const defaults: StoredAiSettings = {
  provider: "deepseek",
  apiUrl: "https://api.deepseek.com",
  model: "deepseek-v4-flash",
  rememberKey: true,
  apiKey: "",
  lastConnectedAt: "",
  connectedModel: "",
};

let volatileKey = "";

function normalize(settings: Partial<StoredAiSettings>): StoredAiSettings {
  return {
    ...defaults,
    ...settings,
    provider: "deepseek",
    apiUrl: settings.apiUrl?.trim().replace(/\/+$/, "") || defaults.apiUrl,
    model: settings.model?.trim() || defaults.model,
    apiKey: settings.apiKey?.trim() || "",
    lastConnectedAt: settings.lastConnectedAt ?? "",
    connectedModel: settings.connectedModel ?? "",
  };
}

async function getStored(): Promise<StoredAiSettings> {
  const stored = await browser.storage.local.get(STORAGE_KEY);
  return normalize(
    (stored[STORAGE_KEY] as Partial<StoredAiSettings> | undefined) ?? {},
  );
}

export async function getAiSettings(): Promise<AiSettings> {
  const settings = await getStored();
  if (!settings.apiKey && volatileKey) settings.apiKey = volatileKey;
  return settings;
}

export async function saveAiSettings(settings: AiSettings): Promise<void> {
  const previous = await getStored();
  const previousEffectiveKey = previous.apiKey || volatileKey;
  const normalized = normalize(settings);
  const connectionChanged =
    previousEffectiveKey !== normalized.apiKey ||
    previous.apiUrl !== normalized.apiUrl ||
    previous.model !== normalized.model;

  normalized.lastConnectedAt = connectionChanged
    ? ""
    : previous.lastConnectedAt;
  normalized.connectedModel = connectionChanged
    ? ""
    : previous.connectedModel;
  volatileKey = normalized.apiKey;

  await browser.storage.local.set({
    [STORAGE_KEY]: normalized.rememberKey
      ? normalized
      : { ...normalized, apiKey: "" },
  });
}

export async function deleteAiKey(): Promise<void> {
  volatileKey = "";
  const settings = await getStored();
  await browser.storage.local.set({
    [STORAGE_KEY]: {
      ...settings,
      apiKey: "",
      lastConnectedAt: "",
      connectedModel: "",
    },
  });
}

export async function markAiConnected(model: string): Promise<void> {
  const settings = await getStored();
  settings.lastConnectedAt = new Date().toISOString();
  settings.connectedModel = model;
  await browser.storage.local.set({ [STORAGE_KEY]: settings });
}

export async function getSafeAiStatus(): Promise<SafeAiStatus> {
  const settings = await getAiSettings();
  const metadata = await getStored();
  return {
    configured: settings.apiKey.length > 0,
    connected:
      settings.apiKey.length > 0 &&
      Boolean(metadata.lastConnectedAt) &&
      metadata.connectedModel === settings.model,
    lastConnectedAt: metadata.lastConnectedAt,
    provider: "deepseek",
    apiUrl: settings.apiUrl,
    model: settings.model,
    rememberKey: settings.rememberKey,
  };
}
