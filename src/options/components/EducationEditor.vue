<script setup lang="ts">
import type { Education } from "../../profile/profile.types";

const model = defineModel<Education[]>({ required: true });

const add = (): void => {
  model.value.push({
    institution: "",
    faculty: "",
    specialization: "",
    degree: "",
    graduationYear: new Date().getFullYear(),
  });
};
</script>

<template>
  <section class="section">
    <div class="section__head">
      <h2>Образование</h2>
      <button class="button" type="button" @click="add">+ Добавить</button>
    </div>
    <div v-if="model.length" class="cards">
      <article v-for="(education, index) in model" :key="index" class="card">
        <header class="card__head">
          <h3>{{ education.institution || `Образование ${index + 1}` }}</h3>
          <button class="icon-button icon-button--danger" type="button" @click="model.splice(index, 1)">×</button>
        </header>
        <div class="grid grid--3">
          <label class="field"><span>Учебное заведение</span><input v-model="education.institution" /></label>
          <label class="field"><span>Факультет</span><input v-model="education.faculty" /></label>
          <label class="field"><span>Специальность</span><input v-model="education.specialization" /></label>
          <label class="field"><span>Уровень</span><input v-model="education.degree" /></label>
          <label class="field"><span>Год окончания</span><input v-model.number="education.graduationYear" type="number" min="1950" max="2100" /></label>
        </div>
      </article>
    </div>
    <div v-else class="empty-state">Образование пока не добавлено.</div>
  </section>
</template>

