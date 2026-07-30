<script setup lang="ts">
import type { Language } from "../../profile/profile.types";

const summary = defineModel<string>("summary", { required: true });
const skillsText = defineModel<string>("skillsText", { required: true });
const languages = defineModel<Language[]>("languages", { required: true });
</script>

<template>
  <section class="section">
    <h2>Обо мне и навыки</h2>
    <label class="field">
      <span>Обо мне</span>
      <textarea v-model="summary" rows="12" />
    </label>
    <label class="field" style="margin-top: 14px">
      <span>Ключевые навыки через запятую</span>
      <textarea v-model="skillsText" rows="4" />
    </label>
    <div class="section__head" style="margin-top: 18px">
      <h3>Языки</h3>
      <button class="button" type="button" @click="languages.push({ name: '', level: '' })">+ Язык</button>
    </div>
    <div class="cards" style="margin-top: 12px">
      <div v-for="(language, index) in languages" :key="index" class="card grid grid--3">
        <label class="field"><span>Язык</span><input v-model="language.name" /></label>
        <label class="field"><span>Уровень</span><input v-model="language.level" /></label>
        <button class="button button--danger" type="button" @click="languages.splice(index, 1)">Удалить</button>
      </div>
    </div>
  </section>
</template>

