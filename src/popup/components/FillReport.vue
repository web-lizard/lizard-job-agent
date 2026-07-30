<script setup lang="ts">
import { computed } from "vue";
import type { FillResult } from "../../shared/messages";

const props = defineProps<{ report: FillResult }>();
const review = computed(() => props.report.skipped.length + props.report.failed.length);
</script>

<template>
  <section class="report">
    <div class="report__summary">
      <div class="report__metric">Заполнено<strong>{{ report.filled.length }}</strong></div>
      <div class="report__metric">Проверить<strong>{{ review }}</strong></div>
    </div>
    <ul class="report__list">
      <li v-for="(item, index) in report.filled" :key="`ok-${index}`">
        <span class="report__ok">✓</span><span>{{ item.label }}</span>
      </li>
      <li v-for="(item, index) in report.skipped" :key="`skip-${index}`">
        <span class="report__warn">!</span>
        <span>{{ item.label }} — {{ item.reason }}</span>
      </li>
      <li v-for="(item, index) in report.failed" :key="`fail-${index}`">
        <span class="report__warn">×</span>
        <span>{{ item.label }} — {{ item.reason }}</span>
      </li>
    </ul>
  </section>
</template>

