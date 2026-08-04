<script setup lang="ts">
import { ref } from "vue";
import browser from "webextension-polyfill";
import type { JobProfile } from "../../profile/profile.types";
import {
  MESSAGE_TYPES,
  type ParsedResumeResponse,
} from "../../shared/messages";

const props = defineProps<{
  configured: boolean;
}>();
const model = defineModel<string>({ required: true });
const emit = defineEmits<{ parsed: [profile: JobProfile] }>();
const fileInput = ref<HTMLInputElement>();
const busy = ref(false);
const error = ref("");
const message = ref("");
const requestId = ref("");

async function paste(): Promise<void> {
  error.value = "";
  try {
    model.value = await navigator.clipboard.readText();
    message.value = "Текст вставлен из буфера.";
  } catch {
    error.value =
      "Firefox не дал доступ к буферу. Вставьте текст в поле сочетанием Ctrl+V.";
  }
}

async function loadFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension || !["txt", "md", "json"].includes(extension)) {
    error.value = "Поддерживаются только файлы .txt, .md и .json.";
    input.value = "";
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    error.value = "Файл больше 5 МБ. Для MVP загрузите текстовый файл меньшего размера.";
    input.value = "";
    return;
  }
  model.value = await file.text();
  message.value = `Загружен файл ${file.name}.`;
  error.value = "";
  input.value = "";
}

async function parse(): Promise<void> {
  if (!props.configured) {
    error.value = "Сначала добавьте API-ключ DeepSeek.";
    return;
  }
  if (!model.value.trim()) {
    error.value = "Вставьте или загрузите текст резюме.";
    return;
  }
  busy.value = true;
  error.value = "";
  message.value = "";
  requestId.value = crypto.randomUUID();
  const response = (await browser.runtime.sendMessage({
    type: MESSAGE_TYPES.AI_PARSE_RESUME,
    resumeText: model.value,
    requestId: requestId.value,
  })) as ParsedResumeResponse;
  busy.value = false;
  if (response.ok) {
    message.value = "Резюме распознано и сохранено локально.";
    emit("parsed", response.data);
  } else {
    error.value = response.error;
  }
}

async function cancel(): Promise<void> {
  if (!requestId.value) return;
  await browser.runtime.sendMessage({
    type: MESSAGE_TYPES.AI_CANCEL_REQUEST,
    requestId: requestId.value,
  });
}
</script>

<template>
  <section class="section">
    <div class="section__head">
      <div>
        <span class="eyebrow">ШАГ 2</span>
        <h2>Моё резюме</h2>
      </div>
      <span class="local-badge">Локальная копия</span>
    </div>
    <p class="muted">Вставьте готовый текст. DeepSeek извлечёт данные, не меняя исходные формулировки.</p>
    <p class="privacy-note">
      При разборе полный текст резюме отправляется в API DeepSeek. На другие серверы расширение его не передаёт.
    </p>
    <label class="field resume-source">
      <span>Текст резюме</span>
      <textarea
        v-model="model"
        rows="18"
        placeholder="Fullstack-разработчик…&#10;&#10;Опыт работы…&#10;&#10;Навыки…"
      />
    </label>
    <div class="resume-actions">
      <button class="button" type="button" @click="paste">Вставить из буфера</button>
      <button class="button" type="button" @click="fileInput?.click()">Загрузить файл</button>
      <input ref="fileInput" hidden type="file" accept=".txt,.md,.json,text/plain,application/json" @change="loadFile" />
      <span class="muted file-hint">TXT · MD · JSON</span>
      <div class="action-spacer" />
      <button v-if="busy" class="button" type="button" @click="cancel">Отменить</button>
      <button class="button button--primary" type="button" :disabled="busy || !model.trim()" @click="parse">
        <span v-if="busy" class="spinner" />{{ busy ? "Разбираю резюме…" : "Разобрать через DeepSeek" }}
      </button>
    </div>
    <p v-if="message" class="status-message">{{ message }}</p>
    <p v-if="error" class="error-message">{{ error }}</p>
  </section>
</template>
