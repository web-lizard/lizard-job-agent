<script setup lang="ts">
import type { JobProfile } from "../../profile/profile.types";

const personal = defineModel<JobProfile["personal"]>("personal", { required: true });
const target = defineModel<JobProfile["target"]>("target", { required: true });
const links = defineModel<JobProfile["links"]>("links", { required: true });

const employmentText = defineModel<string>("employmentText", { required: true });
const formatsText = defineModel<string>("formatsText", { required: true });
</script>

<template>
  <section class="section">
    <h2>Личные данные</h2>
    <div class="grid grid--3">
      <label class="field"><span>Фамилия</span><input v-model="personal.lastName" /></label>
      <label class="field"><span>Имя</span><input v-model="personal.firstName" /></label>
      <label class="field"><span>Отчество</span><input v-model="personal.middleName" /></label>
      <label class="field"><span>Email</span><input v-model="personal.email" type="email" /></label>
      <label class="field"><span>Телефон</span><input v-model="personal.phone" type="tel" /></label>
      <label class="field"><span>Дата рождения</span><input v-model="personal.birthDate" type="date" /></label>
      <label class="field"><span>Город</span><input v-model="personal.city" /></label>
      <label class="field"><span>Гражданство</span><input v-model="personal.citizenship" /></label>
    </div>
    <div class="grid" style="margin-top: 14px">
      <label class="check"><input v-model="personal.relocation" type="checkbox" /> Готов к переезду</label>
      <label class="check"><input v-model="personal.businessTrips" type="checkbox" /> Готов к командировкам</label>
      <label class="check"><input v-model="personal.remoteWork" type="checkbox" /> Рассматриваю удалённую работу</label>
    </div>
  </section>

  <section class="section">
    <h2>Желаемая работа</h2>
    <div class="grid grid--3">
      <label class="field"><span>Название резюме / должность</span><input v-model="target.position" /></label>
      <label class="field"><span>Желаемый доход</span><input v-model.number="target.salary" type="number" min="0" /></label>
      <label class="field">
        <span>Валюта</span>
        <select v-model="target.currency">
          <option value="RUB">RUB — ₽</option>
          <option value="USD">USD — $</option>
          <option value="EUR">EUR — €</option>
        </select>
      </label>
      <label class="field"><span>Занятость через запятую</span><input v-model="employmentText" /></label>
      <label class="field"><span>Форматы работы через запятую</span><input v-model="formatsText" /></label>
    </div>
  </section>

  <section class="section">
    <h2>Ссылки</h2>
    <div class="grid grid--3">
      <label class="field"><span>GitHub</span><input v-model="links.github" placeholder="https://github.com/..." /></label>
      <label class="field"><span>Портфолио</span><input v-model="links.portfolio" /></label>
      <label class="field"><span>Сайт</span><input v-model="links.website" /></label>
      <label class="field"><span>Telegram</span><input v-model="links.telegram" /></label>
      <label class="field"><span>LinkedIn</span><input v-model="links.linkedin" /></label>
      <label class="field"><span>HH.ru</span><input v-model="links.hh" /></label>
    </div>
  </section>
</template>

