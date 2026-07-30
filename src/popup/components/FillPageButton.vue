<script setup lang="ts">
defineProps<{ disabled: boolean; busy: boolean }>();
defineEmits<{ fill: [] }>();
</script>

<template>
  <button
    class="button button--primary fill-button"
    type="button"
    :disabled="disabled || busy"
    @click="$emit('fill')"
  >
    {{ busy ? "Заполняю…" : "Заполнить страницу" }}
  </button>
</template>

