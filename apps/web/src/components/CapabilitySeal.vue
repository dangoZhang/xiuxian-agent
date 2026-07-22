<script setup lang="ts">
defineProps<{
  label: string
  passed?: boolean | undefined
  pending?: boolean | undefined
}>()
</script>

<template>
  <div class="capability" :class="{ passed, pending }">
    <span class="capability__mark" aria-hidden="true">{{ pending ? '⋯' : passed ? '验' : '待' }}</span>
    <span>{{ label }}</span>
  </div>
</template>

<style scoped>
.capability {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  color: var(--ink-muted);
  font: 0.76rem/1.2 var(--font-ui);
  letter-spacing: 0.08em;
}
.capability__mark {
  display: grid;
  width: 1.55rem;
  height: 1.55rem;
  place-items: center;
  border: 1px solid currentColor;
  transform: rotate(-2deg);
  font-family: var(--font-serif);
}
.capability.passed { color: var(--jade-bright); }
.capability.passed .capability__mark { border-color: var(--jade); background: color-mix(in srgb, var(--jade) 16%, transparent); }
.capability.pending .capability__mark { animation: breathe 1.3s ease-in-out infinite; }
@keyframes breathe { 50% { opacity: 0.45; } }
@media (prefers-reduced-motion: reduce) { .capability.pending .capability__mark { animation: none; } }
</style>
