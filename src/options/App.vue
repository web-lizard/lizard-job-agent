<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import browser from "webextension-polyfill";
import { emptyProfile } from "../profile/profile.defaults";
import { getProfile, saveProfile } from "../profile/profile.storage";
import type { JobProfile } from "../profile/profile.types";
import { validateProfile } from "../profile/profile.validation";
import EducationEditor from "./components/EducationEditor.vue";
import ExperienceEditor from "./components/ExperienceEditor.vue";
import ImportExport from "./components/ImportExport.vue";
import PersonalDataForm from "./components/PersonalDataForm.vue";
import SkillsEditor from "./components/SkillsEditor.vue";

const profile = reactive<JobProfile>(emptyProfile());
const loaded = ref(false);
const saveState = ref("Загрузка…");
let timer: number | undefined;

const skillsText = computed({
  get: () => profile.skills.join(", "),
  set: (value: string) => {
    profile.skills = value.split(",").map((item) => item.trim()).filter(Boolean);
  },
});
const employmentText = computed({
  get: () => profile.target.employmentTypes.join(", "),
  set: (value: string) => {
    profile.target.employmentTypes = value.split(",").map((item) => item.trim()).filter(Boolean);
  },
});
const formatsText = computed({
  get: () => profile.target.workFormats.join(", "),
  set: (value: string) => {
    profile.target.workFormats = value.split(",").map((item) => item.trim()).filter(Boolean);
  },
});
const completion = computed(() => validateProfile(profile).completion);

function replaceProfile(next: JobProfile): void {
  Object.assign(profile, emptyProfile(), structuredClone(next));
}

onMounted(async () => {
  replaceProfile(await getProfile());
  loaded.value = true;
  saveState.value = "Сохранено локально";
});

watch(
  profile,
  () => {
    if (!loaded.value) return;
    saveState.value = "Сохранение…";
    window.clearTimeout(timer);
    timer = window.setTimeout(async () => {
      await saveProfile(structuredClone(profile));
      saveState.value = "Сохранено локально";
    }, 350);
  },
  { deep: true },
);

function clear(): void {
  replaceProfile(emptyProfile());
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.jobProfile?.newValue && !loaded.value) {
    replaceProfile(changes.jobProfile.newValue as JobProfile);
  }
});
</script>

<template>
  <main class="options-shell">
    <header class="options-header">
      <div class="brand">
        <img src="/icons/lizard-96.png" alt="" />
        <div>
          <h1>Lizard Job Agent</h1>
          <p>Локальный профиль для аккуратного заполнения форм</p>
        </div>
      </div>
      <div class="completion">
        <div class="completion__row">
          <span>Профиль заполнен</span>
          <strong>{{ completion }}%</strong>
        </div>
        <div class="completion__bar"><span :style="{ width: `${completion}%` }" /></div>
        <div class="save-state">{{ saveState }}</div>
      </div>
    </header>

    <PersonalDataForm
      v-model:personal="profile.personal"
      v-model:target="profile.target"
      v-model:links="profile.links"
      v-model:employment-text="employmentText"
      v-model:formats-text="formatsText"
    />
    <SkillsEditor
      v-model:summary="profile.summary"
      v-model:skills-text="skillsText"
      v-model:languages="profile.languages"
    />
    <ExperienceEditor v-model="profile.experience" />
    <EducationEditor v-model="profile.education" />
    <ImportExport :profile="profile" @imported="replaceProfile" @clear="clear" />
  </main>
</template>

