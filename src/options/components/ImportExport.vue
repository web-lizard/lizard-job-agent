<script setup lang="ts">
import { ref } from "vue";
import type { JobProfile } from "../../profile/profile.types";
import { validateProfile } from "../../profile/profile.validation";

const emit = defineEmits<{
  imported: [profile: JobProfile];
  clear: [];
}>();
const props = defineProps<{ profile: JobProfile }>();
const message = ref("");
const fileInput = ref<HTMLInputElement>();

function exportProfile(): void {
  const blob = new Blob([JSON.stringify(props.profile, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "lizard-job-profile.json";
  link.click();
  URL.revokeObjectURL(link.href);
  message.value = "Профиль экспортирован.";
}

async function importFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const parsed: unknown = JSON.parse(await file.text());
    const validation = validateProfile(parsed);
    if (!validation.valid) {
      throw new Error(validation.errors.join("; "));
    }
    emit("imported", parsed as JobProfile);
    message.value = "Профиль импортирован и сохранён локально.";
  } catch (error) {
    message.value = `Не удалось импортировать: ${error instanceof Error ? error.message : "ошибка файла"}`;
  } finally {
    input.value = "";
  }
}

function clear(): void {
  if (window.confirm("Очистить профиль и текст резюме? API-ключ DeepSeek останется и удаляется отдельно в блоке ИИ-агента.")) {
    emit("clear");
    message.value = "Профиль очищен.";
  }
}
</script>

<template>
  <section class="section">
    <h2>Импорт и резервная копия</h2>
    <p class="muted">
      JSON хранится только у вас. Экспорт удобно использовать как резервную копию и для переноса между Firefox-профилями.
    </p>
    <div class="import-actions">
      <div style="display: flex; flex-wrap: wrap; gap: 10px">
        <button class="button button--primary" type="button" @click="exportProfile">Экспортировать JSON</button>
        <button class="button" type="button" @click="fileInput?.click()">Импортировать JSON</button>
        <input ref="fileInput" hidden type="file" accept="application/json,.json" @change="importFile" />
      </div>
      <button class="button button--danger" type="button" @click="clear">Очистить резюме</button>
    </div>
    <p v-if="message" class="status-message">{{ message }}</p>
  </section>
</template>
