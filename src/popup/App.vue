<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import browser from "webextension-polyfill";
import type {
  ExecutePlanResult,
  PageDescription,
  SafeAiStatus,
} from "../ai/ai.types";
import { getPreferences, getProfile, savePreferences } from "../profile/profile.storage";
import { getResumeParsedAt } from "../profile/resume.storage";
import type { ExtensionPreferences, JobProfile } from "../profile/profile.types";
import { validateProfile } from "../profile/profile.validation";
import {
  MESSAGE_TYPES,
  emptyFillResult,
  mergeFillResults,
  type AiStatusResponse,
  type FillPlanResponse,
  type FillResult,
} from "../shared/messages";
import FillReport from "./components/FillReport.vue";

const profile = ref<JobProfile>();
const preferences = ref<ExtensionPreferences>({ doNotOverwrite: true });
const aiStatus = ref<SafeAiStatus>({
  configured: false,
  connected: false,
  lastConnectedAt: "",
  provider: "deepseek",
  apiUrl: "https://api.deepseek.com",
  model: "deepseek-v4-flash",
  rememberKey: true,
});
const parsedAt = ref("");
const page = ref<PageDescription>({ title: "", url: "", fields: [] });
const busy = ref(false);
const report = ref<FillResult>();
const error = ref("");
const progress = ref("");
const activeTabId = ref<number>();
const requestId = ref("");

const profileValidation = computed(() =>
  profile.value ? validateProfile(profile.value) : { valid: false, completion: 0 },
);
const resumeReady = computed(
  () => Boolean(parsedAt.value) && profileValidation.value.valid,
);

onMounted(async () => {
  const [storedProfile, storedPreferences, storedParsedAt, statusResponse] =
    await Promise.all([
      getProfile(),
      getPreferences(),
      getResumeParsedAt(),
      browser.runtime.sendMessage({ type: MESSAGE_TYPES.AI_GET_STATUS }) as Promise<AiStatusResponse>,
    ]);
  profile.value = storedProfile;
  preferences.value = storedPreferences;
  parsedAt.value = storedParsedAt;
  if (statusResponse.ok) aiStatus.value = statusResponse.data;

  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  activeTabId.value = tab?.id;
  if (!tab?.id) return;
  try {
    page.value = (await browser.tabs.sendMessage(tab.id, {
      type: MESSAGE_TYPES.DESCRIBE_PAGE,
    })) as PageDescription;
  } catch {
    error.value = "Откройте форму на hh.ru и обновите вкладку после установки расширения.";
  }
});

async function changePreference(): Promise<void> {
  await savePreferences(preferences.value);
}

async function cancel(): Promise<void> {
  if (!requestId.value) return;
  await browser.runtime.sendMessage({
    type: MESSAGE_TYPES.AI_CANCEL_REQUEST,
    requestId: requestId.value,
  });
}

async function fillViaAi(): Promise<void> {
  if (!activeTabId.value || !profile.value) return;
  busy.value = true;
  error.value = "";
  report.value = undefined;
  let aggregate = emptyFillResult();
  const maxPasses = Math.min(profile.value.experience.length + 2, 12);

  try {
    for (let pass = 0; pass < maxPasses; pass += 1) {
      progress.value = `Анализ страницы${pass ? ` · проход ${pass + 1}` : ""}…`;
      const description = (await browser.tabs.sendMessage(activeTabId.value, {
        type: MESSAGE_TYPES.DESCRIBE_PAGE,
      })) as PageDescription;
      page.value = description;
      if (description.fields.length === 0) {
        throw new Error("На странице не найдено доступных полей.");
      }

      requestId.value = crypto.randomUUID();
      progress.value = "DeepSeek строит безопасный план…";
      const planned = (await browser.runtime.sendMessage({
        type: MESSAGE_TYPES.AI_CREATE_FILL_PLAN,
        profile: profile.value,
        page: description,
        requestId: requestId.value,
      })) as FillPlanResponse;
      if (!planned.ok) throw new Error(planned.error);
      if (planned.data.actions.length === 0) {
        aggregate.warnings.push(
          ...planned.data.warnings,
          "DeepSeek не предложил безопасных действий для текущих полей.",
        );
        break;
      }

      progress.value = "Заполняю поля локально…";
      const executed = (await browser.tabs.sendMessage(activeTabId.value, {
        type: MESSAGE_TYPES.EXECUTE_FILL_PLAN,
        plan: planned.data,
        doNotOverwrite: preferences.value.doNotOverwrite,
      })) as ExecutePlanResult;
      aggregate = mergeFillResults(aggregate, executed.fillResult);
      if (!executed.clickedAddExperience) break;
    }
    report.value = aggregate;
  } catch (reason) {
    error.value =
      reason instanceof Error ? reason.message : "Не удалось выполнить AI-заполнение.";
  } finally {
    busy.value = false;
    progress.value = "";
  }
}

function openOptions(): void {
  void browser.runtime.openOptionsPage();
}
</script>

<template>
  <main class="popup">
    <header class="popup__brand">
      <img src="/icons/lizard-96.png" alt="" />
      <div>
        <h1>Lizard Job Agent</h1>
        <p>AI-first заполнение без отправки формы</p>
      </div>
    </header>

    <div class="ai-status-list">
      <div class="ai-status-row">
        <div>
          <strong>DeepSeek</strong>
          <span>{{ aiStatus.model }}</span>
        </div>
        <b :class="{ ok: aiStatus.connected }">
          <i />{{ aiStatus.connected ? "подключён" : aiStatus.configured ? "ключ добавлен" : "не настроен" }}
        </b>
      </div>
      <div class="ai-status-row">
        <div>
          <strong>Резюме</strong>
          <span v-if="resumeReady">{{ profile?.experience.length ?? 0 }} мест работы</span>
          <span v-else>Загрузите и распознайте текст</span>
        </div>
        <b :class="{ ok: resumeReady }"><i />{{ resumeReady ? "распознано" : "не загружено" }}</b>
      </div>
      <div class="ai-status-row">
        <div>
          <strong>Текущая страница</strong>
          <span>{{ page.title || "HH.ru" }}</span>
        </div>
        <b>{{ page.fields.length }} полей</b>
      </div>
    </div>

    <label class="check preference">
      <input
        v-model="preferences.doNotOverwrite"
        type="checkbox"
        @change="changePreference"
      />
      Не перезаписывать заполненные поля
    </label>

    <button
      v-if="aiStatus.configured && resumeReady"
      class="button button--primary fill-button"
      type="button"
      :disabled="busy || !page.fields.length"
      @click="fillViaAi"
    >
      <span v-if="busy" class="popup-spinner" />
      {{ busy ? progress || "Работаю…" : "Заполнить через ИИ" }}
    </button>
    <button v-else class="button button--primary fill-button" type="button" @click="openOptions">
      {{ !aiStatus.configured ? "Добавить API-ключ" : "Загрузить резюме" }}
    </button>
    <button v-if="busy" class="button popup-cancel" type="button" @click="cancel">
      Отменить запрос
    </button>

    <p v-if="error" class="popup-error">{{ error }}</p>
    <FillReport v-if="report" :report="report" />

    <button class="button popup__footer" type="button" @click="openOptions">
      Настройки агента
    </button>
  </main>
</template>

