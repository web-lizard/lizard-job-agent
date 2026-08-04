<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from "vue";
import { emptyProfile } from "../profile/profile.defaults";
import { getProfile, saveProfile } from "../profile/profile.storage";
import {
  clearResumeData,
  getResumeParsedAt,
  getResumeText,
  markResumeParsed,
  saveResumeText,
} from "../profile/resume.storage";
import type { JobProfile } from "../profile/profile.types";
import { validateProfile } from "../profile/profile.validation";
import type { SafeAiStatus } from "../ai/ai.types";
import AiAgentSettings from "./components/AiAgentSettings.vue";
import EducationEditor from "./components/EducationEditor.vue";
import ExperienceEditor from "./components/ExperienceEditor.vue";
import ImportExport from "./components/ImportExport.vue";
import PersonalDataForm from "./components/PersonalDataForm.vue";
import ResumeInput from "./components/ResumeInput.vue";
import ResumeSummary from "./components/ResumeSummary.vue";
import SkillsEditor from "./components/SkillsEditor.vue";

const profile = reactive<JobProfile>(emptyProfile());
const resumeText = ref("");
const parsedAt = ref("");
const loaded = ref(false);
const saveState = ref("Загрузка…");
const manualOpen = ref(false);
const jsonOpen = ref(false);
const aiStatus = ref<SafeAiStatus>({
  configured: false,
  connected: false,
  lastConnectedAt: "",
  provider: "deepseek",
  apiUrl: "https://api.deepseek.com",
  model: "deepseek-v4-flash",
  rememberKey: true,
});
let profileTimer: number | undefined;
let textTimer: number | undefined;

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
const recognized = computed(
  () => Boolean(parsedAt.value) && validateProfile(profile).valid,
);

function replaceProfile(next: JobProfile): void {
  Object.assign(profile, emptyProfile(), structuredClone(next));
}

onMounted(async () => {
  const [storedProfile, storedText, storedParsedAt] = await Promise.all([
    getProfile(),
    getResumeText(),
    getResumeParsedAt(),
  ]);
  replaceProfile(storedProfile);
  resumeText.value = storedText;
  parsedAt.value = storedParsedAt;
  loaded.value = true;
  saveState.value = "Данные сохранены локально";
});

watch(
  profile,
  () => {
    if (!loaded.value) return;
    saveState.value = "Сохранение профиля…";
    window.clearTimeout(profileTimer);
    profileTimer = window.setTimeout(async () => {
      await saveProfile(structuredClone(profile));
      saveState.value = "Данные сохранены локально";
    }, 350);
  },
  { deep: true },
);

watch(resumeText, () => {
  if (!loaded.value) return;
  saveState.value = "Сохранение текста…";
  window.clearTimeout(textTimer);
  textTimer = window.setTimeout(async () => {
    await saveResumeText(resumeText.value);
    saveState.value = "Данные сохранены локально";
  }, 350);
});

function parsed(next: JobProfile): void {
  replaceProfile(next);
  parsedAt.value = new Date().toISOString();
}

async function imported(next: JobProfile): Promise<void> {
  replaceProfile(next);
  await markResumeParsed();
  parsedAt.value = new Date().toISOString();
}

async function editManually(): Promise<void> {
  manualOpen.value = true;
  await nextTick();
  document.querySelector("#manual-correction")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

function reparse(): void {
  document.querySelector("#resume-source")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

async function clear(): Promise<void> {
  replaceProfile(emptyProfile());
  resumeText.value = "";
  parsedAt.value = "";
  await clearResumeData();
}
</script>

<template>
  <main class="options-shell">
    <header class="options-header">
      <div class="brand">
        <img src="/icons/lizard-96.png" alt="" />
        <div>
          <h1>Lizard Job Agent</h1>
          <p>Резюме превращается в готовый план заполнения через DeepSeek</p>
        </div>
      </div>
      <div class="completion">
        <div class="completion__row">
          <span>Готовность профиля</span>
          <strong>{{ completion }}%</strong>
        </div>
        <div class="completion__bar"><span :style="{ width: `${completion}%` }" /></div>
        <div class="save-state">{{ saveState }}</div>
      </div>
    </header>

    <AiAgentSettings @status="aiStatus = $event" />

    <div id="resume-source">
      <ResumeInput
        v-model="resumeText"
        :configured="aiStatus.configured"
        @parsed="parsed"
      />
    </div>

    <ResumeSummary
      v-if="recognized"
      :profile="profile"
      @view="jsonOpen = !jsonOpen"
      @edit="editManually"
      @reparse="reparse"
    />

    <section v-if="jsonOpen" class="section json-preview">
      <div class="section__head">
        <h2>Распознанные данные</h2>
        <button class="button" type="button" @click="jsonOpen = false">Закрыть</button>
      </div>
      <pre>{{ JSON.stringify(profile, null, 2) }}</pre>
    </section>

    <details
      id="manual-correction"
      class="manual-details"
      :open="manualOpen"
      @toggle="manualOpen = ($event.currentTarget as HTMLDetailsElement).open"
    >
      <summary>
        <span>
          <small>Дополнительно</small>
          Ручная коррекция распознанных данных
        </span>
        <strong>{{ manualOpen ? "Свернуть" : "Открыть" }}</strong>
      </summary>
      <div class="manual-details__content">
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
        <ImportExport :profile="profile" @imported="imported" @clear="clear" />
      </div>
    </details>
  </main>
</template>
