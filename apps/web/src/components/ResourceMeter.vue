<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ label: string; value: number; max: number; tone?: 'hp' | 'qi' | 'sense' | 'life' }>()
const percent = computed(() => Math.max(0, Math.min(100, props.max > 0 ? props.value / props.max * 100 : 0)))
</script>

<template>
  <div class="meter" :class="`meter--${tone ?? 'qi'}`" role="progressbar" :aria-label="label" aria-valuemin="0" :aria-valuemax="max" :aria-valuenow="value">
    <div class="meter__head"><span>{{ label }}</span><strong>{{ value }}<i>/ {{ max }}</i></strong></div>
    <div class="meter__track"><span :style="{ width: `${percent}%` }" /></div>
  </div>
</template>

<style scoped>
.meter { margin-top: 0.65rem; }
.meter__head { display: flex; align-items: baseline; justify-content: space-between; color: var(--muted); font-size: 0.68rem; }
.meter__head strong { color: var(--text); font-size: 0.7rem; }.meter__head i { color: var(--faint); font-style: normal; font-weight: 400; }
.meter__track { height: 2px; margin-top: 0.3rem; background: var(--line); }.meter__track span { display: block; height: 100%; background: var(--player); transition: width 300ms ease; }
.meter--hp .meter__track span { background: var(--battle); }.meter--qi .meter__track span { background: #52758a; }.meter--sense .meter__track span { background: var(--player); }.meter--life .meter__track span { background: var(--heaven); }
@media (prefers-reduced-motion: reduce) { .meter__track span { transition: none; } }
</style>
