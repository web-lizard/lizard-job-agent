<script setup lang="ts">
import type { WorkExperience } from "../../profile/profile.types";

const model = defineModel<WorkExperience[]>({ required: true });

function emptyExperience(): WorkExperience {
  const now = new Date();
  return {
    company: "",
    position: "",
    city: "",
    website: "",
    industry: "",
    startMonth: now.getMonth() + 1,
    startYear: now.getFullYear(),
    endMonth: null,
    endYear: null,
    currentlyWorking: false,
    description: "",
  };
}

function move(index: number, direction: -1 | 1): void {
  const target = index + direction;
  if (target < 0 || target >= model.value.length) return;
  const [item] = model.value.splice(index, 1);
  if (item) model.value.splice(target, 0, item);
}
</script>

<template>
  <section class="section">
    <div class="section__head">
      <h2>Опыт работы</h2>
      <button class="button" type="button" @click="model.push(emptyExperience())">+ Добавить место</button>
    </div>
    <div v-if="model.length" class="cards">
      <article v-for="(experience, index) in model" :key="index" class="card">
        <header class="card__head">
          <h3>{{ experience.company || `Место работы ${index + 1}` }}</h3>
          <div class="card__actions">
            <button class="icon-button" :disabled="index === 0" title="Выше" type="button" @click="move(index, -1)">↑</button>
            <button class="icon-button" :disabled="index === model.length - 1" title="Ниже" type="button" @click="move(index, 1)">↓</button>
            <button class="icon-button icon-button--danger" title="Удалить" type="button" @click="model.splice(index, 1)">×</button>
          </div>
        </header>
        <div class="grid grid--3">
          <label class="field"><span>Компания</span><input v-model="experience.company" /></label>
          <label class="field"><span>Должность</span><input v-model="experience.position" /></label>
          <label class="field"><span>Город</span><input v-model="experience.city" /></label>
          <label class="field"><span>Сайт компании</span><input v-model="experience.website" /></label>
          <label class="field"><span>Сфера деятельности</span><input v-model="experience.industry" /></label>
        </div>
        <div class="grid grid--3" style="margin-top: 14px">
          <label class="field"><span>Месяц начала</span><input v-model.number="experience.startMonth" type="number" min="1" max="12" /></label>
          <label class="field"><span>Год начала</span><input v-model.number="experience.startYear" type="number" min="1950" max="2100" /></label>
          <label class="check"><input v-model="experience.currentlyWorking" type="checkbox" /> Работаю сейчас</label>
          <label v-if="!experience.currentlyWorking" class="field"><span>Месяц окончания</span><input v-model.number="experience.endMonth" type="number" min="1" max="12" /></label>
          <label v-if="!experience.currentlyWorking" class="field"><span>Год окончания</span><input v-model.number="experience.endYear" type="number" min="1950" max="2100" /></label>
        </div>
        <label class="field" style="margin-top: 14px">
          <span>Обязанности и достижения</span>
          <textarea v-model="experience.description" rows="8" />
        </label>
      </article>
    </div>
    <div v-else class="empty-state">Добавьте хотя бы одно место работы.</div>
  </section>
</template>
