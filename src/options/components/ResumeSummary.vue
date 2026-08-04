<script setup lang="ts">
import { computed } from "vue";
import type { JobProfile } from "../../profile/profile.types";
import { validateProfile } from "../../profile/profile.validation";

const props = defineProps<{ profile: JobProfile }>();
defineEmits<{ view: []; edit: []; reparse: [] }>();
const completion = computed(() => validateProfile(props.profile).completion);
const skills = computed(() => {
  const shown = props.profile.skills.slice(0, 8).join(", ");
  return `${shown}${props.profile.skills.length > 8 ? "…" : ""}`;
});
</script>

<template>
  <section class="section recognized-card">
    <div class="recognized-icon">✓</div>
    <div class="recognized-content">
      <span class="eyebrow">ГОТОВО К ЗАПОЛНЕНИЮ</span>
      <h2>Резюме распознано</h2>
      <div class="recognized-grid">
        <div><span>Желаемая должность</span><strong>{{ profile.target.position || "Не указана" }}</strong></div>
        <div><span>Опыт работы</span><strong>{{ profile.experience.length }} мест</strong></div>
        <div><span>Навыки</span><strong>{{ skills || "Не указаны" }}</strong></div>
        <div><span>Заполненность</span><strong>{{ completion }}%</strong></div>
      </div>
      <div class="recognized-actions">
        <button class="button" type="button" @click="$emit('view')">Посмотреть данные</button>
        <button class="button" type="button" @click="$emit('edit')">Редактировать вручную</button>
        <button class="button" type="button" @click="$emit('reparse')">Разобрать заново</button>
      </div>
    </div>
  </section>
</template>

