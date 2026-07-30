<script setup lang="ts">
defineProps<{
  loaded: boolean;
  completion: number;
  fieldCount: number;
  adapterId: string;
}>();
</script>

<template>
  <div class="status-card">
    <div class="status-row">
      <span>Профиль</span>
      <strong><span class="status-dot" />{{ loaded ? `загружен · ${completion}%` : "не заполнен" }}</strong>
    </div>
    <div class="status-row">
      <span>Найдено полей</span>
      <strong>{{ fieldCount }}</strong>
    </div>
    <div class="status-row">
      <span>Адаптер</span>
      <strong>{{ adapterId }}</strong>
    </div>
  </div>
</template>

