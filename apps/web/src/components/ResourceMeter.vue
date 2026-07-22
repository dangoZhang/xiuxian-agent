<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ label: string; value: number; max: number; tone?: 'hp' | 'qi' | 'sense' | 'life' }>()
const percent = computed(() => Math.max(0, Math.min(100, props.max > 0 ? props.value / props.max * 100 : 0)))
</script>

<template>
  <div class="meter" :class="`meter--${tone ?? 'qi'}`">
    <div class="meter__head"><span>{{ label }}</span><strong>{{ value }}<i>/ {{ max }}</i></strong></div>
    <div class="meter__track"><span :style="{ width: `${percent}%` }" /></div>
  </div>
</template>

<style scoped>
.meter { margin-top: 0.7rem; }
.meter__head { display: flex; align-items: baseline; justify-content: space-between; color: var(--ink-muted); font: 0.64rem var(--font-ui); letter-spacing: 0.08em; }
.meter__head strong { color: var(--paper); font: 0.72rem var(--font-ui); }.meter__head i { color: var(--ink-faint); font-style: normal; font-weight: 400; }
.meter__track { height: 3px; margin-top: 0.3rem; background: var(--line-faint); }.meter__track span { display: block; height: 100%; background: var(--jade-bright); transition: width 300ms ease; }
.meter--hp .meter__track span { background: var(--cinnabar-bright); }.meter--qi .meter__track span { background: #7195ac; }.meter--sense .meter__track span { background: var(--jade-bright); }.meter--life .meter__track span { background: var(--gold); }
@media (prefers-reduced-motion: reduce) { .meter__track span { transition: none; } }
</style>
