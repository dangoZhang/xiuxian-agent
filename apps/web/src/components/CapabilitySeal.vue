<script setup lang="ts">
defineProps<{
  label: string
  passed?: boolean | undefined
  pending?: boolean | undefined
}>()
</script>

<template>
  <div class="capability" :class="{ passed, pending }">
    <span class="capability__mark" aria-hidden="true">{{ pending ? '…' : passed ? '✓' : '○' }}</span>
    <span>{{ label }}</span>
  </div>
</template>

<style scoped>
.capability { display: flex; align-items: center; gap: 0.35rem; color: var(--muted); font-size: 0.75rem; }
.capability__mark { width: 1rem; color: var(--faint); text-align: center; }
.capability.passed { color: var(--player); }
</style>
