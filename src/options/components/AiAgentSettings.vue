<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import browser from "webextension-polyfill";
import type { AiSettings, SafeAiStatus } from "../../ai/ai.types";
import {
  MESSAGE_TYPES,
  type AiResponse,
  type AiSettingsResponse,
  type ConnectionResponse,
} from "../../shared/messages";

const emit = defineEmits<{ status: [status: SafeAiStatus] }>();
const settings = ref<AiSettings>({
  provider: "deepseek",
  apiUrl: "https://api.deepseek.com",
  model: "deepseek-v4-flash",
  rememberKey: true,
  apiKey: "",
});
const showKey = ref(false);
const busy = ref(false);
const connected = ref(false);
const message = ref("");
const error = ref("");
const requestId = ref("");

const maskedHint = computed(() =>
  settings.value.apiKey ? `Ключ сохранён (${settings.value.apiKey.length} символов)` : "",
);

async function load(): Promise<void> {
  const response = (await browser.runtime.sendMessage({
    type: MESSAGE_TYPES.AI_GET_SETTINGS,
  })) as AiSettingsResponse;
  if (response.ok) {
    settings.value = response.data;
    const status = (await browser.runtime.sendMessage({
      type: MESSAGE_TYPES.AI_GET_STATUS,
    })) as AiResponse<SafeAiStatus>;
    if (status.ok) {
      connected.value = status.data.connected;
      emit("status", status.data);
    } else {
      emitStatus();
    }
  } else {
    error.value = response.error;
  }
}

function emitStatus(): void {
  emit("status", {
    configured: Boolean(settings.value.apiKey),
    connected: connected.value,
    lastConnectedAt: "",
    provider: "deepseek",
    apiUrl: settings.value.apiUrl,
    model: settings.value.model,
    rememberKey: settings.value.rememberKey,
  });
}

async function save(): Promise<void> {
  connected.value = false;
  const response = (await browser.runtime.sendMessage({
    type: MESSAGE_TYPES.AI_SAVE_SETTINGS,
    settings: settings.value,
  })) as AiResponse<SafeAiStatus>;
  if (response.ok) {
    emit("status", response.data);
    message.value = settings.value.apiKey
      ? "Настройки сохранены локально."
      : "Настройки сохранены. API-ключ не указан.";
    error.value = "";
  } else {
    error.value = response.error;
  }
}

async function test(): Promise<void> {
  busy.value = true;
  connected.value = false;
  error.value = "";
  message.value = "";
  requestId.value = crypto.randomUUID();
  const response = (await browser.runtime.sendMessage({
    type: MESSAGE_TYPES.AI_TEST_CONNECTION,
    settings: settings.value,
    requestId: requestId.value,
  })) as ConnectionResponse;
  busy.value = false;
  if (!response.ok) {
    error.value = response.error;
    return;
  }
  connected.value = response.data.success;
  if (response.data.success) {
    message.value = `${response.data.message}${response.data.model ? ` Модель: ${response.data.model}.` : ""}`;
    const status = (await browser.runtime.sendMessage({
      type: MESSAGE_TYPES.AI_GET_STATUS,
    })) as AiResponse<SafeAiStatus>;
    if (status.ok) emit("status", status.data);
  } else {
    error.value = response.data.message;
  }
}

async function cancel(): Promise<void> {
  if (!requestId.value) return;
  await browser.runtime.sendMessage({
    type: MESSAGE_TYPES.AI_CANCEL_REQUEST,
    requestId: requestId.value,
  });
}

async function removeKey(): Promise<void> {
  if (!window.confirm("Удалить API-ключ DeepSeek с этого устройства? Профиль и текст резюме останутся.")) {
    return;
  }
  const response = (await browser.runtime.sendMessage({
    type: MESSAGE_TYPES.AI_DELETE_KEY,
  })) as AiResponse<SafeAiStatus>;
  if (response.ok) {
    settings.value.apiKey = "";
    connected.value = false;
    message.value = "API-ключ удалён. Резюме не изменено.";
    emit("status", response.data);
  } else {
    error.value = response.error;
  }
}

onMounted(load);
</script>

<template>
  <section class="section section--hero">
    <div class="section__head">
      <div>
        <span class="eyebrow">ШАГ 1</span>
        <h2>ИИ-агент</h2>
      </div>
      <div class="agent-badge" :class="{ 'agent-badge--ok': connected }">
        <span /> {{ connected ? "DeepSeek подключён" : "Не проверен" }}
      </div>
    </div>

    <div class="grid grid--3">
      <label class="field">
        <span>Провайдер</span>
        <input value="DeepSeek" disabled />
      </label>
      <label class="field">
        <span>API URL</span>
        <input v-model="settings.apiUrl" spellcheck="false" @blur="save" />
      </label>
      <label class="field">
        <span>Модель</span>
        <input v-model="settings.model" list="deepseek-models" spellcheck="false" @blur="save" />
        <datalist id="deepseek-models">
          <option value="deepseek-v4-flash" />
          <option value="deepseek-v4-pro" />
        </datalist>
      </label>
    </div>

    <label class="field api-key-field">
      <span>API-ключ</span>
      <div class="input-with-actions">
        <input
          v-model="settings.apiKey"
          :type="showKey ? 'text' : 'password'"
          autocomplete="off"
          placeholder="sk-••••••••••••••••••••"
          spellcheck="false"
        />
        <button class="mini-button" type="button" @click="showKey = !showKey">
          {{ showKey ? "Скрыть" : "Показать" }}
        </button>
        <button class="mini-button mini-button--danger" type="button" :disabled="!settings.apiKey" @click="removeKey">
          Удалить
        </button>
      </div>
      <small v-if="maskedHint" class="muted">{{ maskedHint }}</small>
    </label>

    <div class="agent-controls">
      <label class="check">
        <input v-model="settings.rememberKey" type="checkbox" @change="save" />
        Запомнить ключ на этом устройстве
      </label>
      <div class="action-group">
        <button v-if="busy" class="button" type="button" @click="cancel">Отменить</button>
        <button class="button" type="button" :disabled="busy" @click="save">
          Сохранить
        </button>
        <button class="button button--primary" type="button" :disabled="busy || !settings.apiKey" @click="test">
          <span v-if="busy" class="spinner" />{{ busy ? "Проверяю…" : "Проверить подключение" }}
        </button>
      </div>
    </div>
    <p v-if="message" class="status-message">{{ message }}</p>
    <p v-if="error" class="error-message">{{ error }}</p>
    <p class="privacy-note">
      Ключ хранится только в локальном хранилище этого Firefox и никогда не передаётся открытой странице.
    </p>
  </section>
</template>
