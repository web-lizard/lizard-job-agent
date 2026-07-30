<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import browser from "webextension-polyfill";
import { getPreferences, getProfile, savePreferences } from "../profile/profile.storage";
import type { ExtensionPreferences, JobProfile } from "../profile/profile.types";
import { validateProfile } from "../profile/profile.validation";
import {
  MESSAGE_TYPES,
  type FillResult,
  type PageDetectionResult,
} from "../shared/messages";
import FillPageButton from "./components/FillPageButton.vue";
import FillReport from "./components/FillReport.vue";
import ProfileStatus from "./components/ProfileStatus.vue";

const profile = ref<JobProfile>();
const preferences = ref<ExtensionPreferences>({ doNotOverwrite: true });
const detection = ref<PageDetectionResult>({
  supported: false,
  adapterId: "—",
  fieldCount: 0,
  pageTitle: "",
});
const busy = ref(false);
const report = ref<FillResult>();
const error = ref("");
const activeTabId = ref<number>();

const completion = computed(() =>
  profile.value ? validateProfile(profile.value).completion : 0,
);
const profileLoaded = computed(() => completion.value > 0);

onMounted(async () => {
  [profile.value, preferences.value] = await Promise.all([
    getProfile(),
    getPreferences(),
  ]);
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  activeTabId.value = tab?.id;
  if (!tab?.id) return;
  try {
    detection.value = (await browser.tabs.sendMessage(tab.id, {
      type: MESSAGE_TYPES.DETECT_PAGE,
    })) as PageDetectionResult;
  } catch {
    error.value = "Откройте форму резюме на hh.ru и повторно откройте расширение.";
  }
});

async function changePreference(): Promise<void> {
  await savePreferences(preferences.value);
}

async function fillPage(): Promise<void> {
  if (!activeTabId.value || !profile.value) return;
  busy.value = true;
  report.value = undefined;
  error.value = "";
  try {
    report.value = (await browser.tabs.sendMessage(activeTabId.value, {
      type: MESSAGE_TYPES.FILL_PAGE,
      profile: profile.value,
      doNotOverwrite: preferences.value.doNotOverwrite,
    })) as FillResult;
  } catch (reason) {
    error.value =
      reason instanceof Error
        ? reason.message
        : "Не удалось связаться со страницей. Обновите вкладку после установки расширения.";
  } finally {
    busy.value = false;
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
        <p>Формы — быстро. Решение — за вами.</p>
      </div>
    </header>

    <ProfileStatus
      :loaded="profileLoaded"
      :completion="completion"
      :field-count="detection.fieldCount"
      :adapter-id="detection.adapterId"
    />

    <label class="check preference">
      <input
        v-model="preferences.doNotOverwrite"
        type="checkbox"
        @change="changePreference"
      />
      Не перезаписывать заполненные поля
    </label>

    <FillPageButton
      :busy="busy"
      :disabled="!profileLoaded || !detection.supported"
      @fill="fillPage"
    />
    <p v-if="error" class="popup-error">{{ error }}</p>
    <FillReport v-if="report" :report="report" />

    <button class="button popup__footer" type="button" @click="openOptions">
      Открыть настройки профиля
    </button>
  </main>
</template>

