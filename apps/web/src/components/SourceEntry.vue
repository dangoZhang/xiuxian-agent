<script setup lang="ts">
import { computed } from 'vue'
import type { ChronicleEntry, Cultivator } from '../types'

const props = defineProps<{
  entry: ChronicleEntry
  cultivators: Cultivator[]
  selected?: boolean
  compact?: boolean
}>()
const emit = defineEmits<{ select: [id: string] }>()

const sourceMeta = {
  heaven: { title: '天道' },
  fate: { title: '命运' },
  player: { title: '我' },
  cultivator: { title: '修士' },
} as const

const actors = computed(() => props.entry.actorIds
  .map((id) => props.cultivators.find((person) => person.id === id))
  .filter(Boolean) as Cultivator[])
const heading = computed(() => {
  if (props.entry.source !== 'cultivator' || !actors.value.length) return sourceMeta[props.entry.source].title
  return `${actors.value.map((item) => item.name).join('、')} · ${actors.value[0]?.realm ?? ''}`
})
const dateText = computed(() => {
  const year = Math.floor((Math.max(1, props.entry.day) - 1) / 360) + 1
  const dayOfYear = (Math.max(1, props.entry.day) - 1) % 360
  const month = Math.floor(dayOfYear / 30) + 1
  const day = dayOfYear % 30 + 1
  return `道历${year}年 ${month}月${day}日`
})
</script>

<template>
  <article
    class="source-entry"
    :class="[`source--${entry.source}`, `kind--${entry.kind}`, { selected, compact }]"
    :data-source="entry.source"
    :data-kind="entry.kind"
    :aria-label="`${heading}，${dateText}`"
  >
    <header class="entry-head">
      <button type="button" class="entry-title" @click="emit('select', entry.id)">{{ heading }}</button>
      <time>{{ dateText }}</time>
    </header>
    <strong v-if="entry.kind === 'combat'" class="combat-label">战斗结算</strong>
    <p class="entry-text">{{ entry.text }}</p>
    <footer v-if="entry.cost.sense || entry.cost.qi || entry.causeIds.length" class="entry-foot">
      <span v-if="entry.cost.sense">神识 −{{ entry.cost.sense }}</span>
      <span v-if="entry.cost.qi">灵力 −{{ entry.cost.qi }}</span>
      <button v-if="entry.causeIds.length" type="button" @click="emit('select', entry.causeIds[0]!)">
        回看因果 {{ entry.causeIds.length }}
      </button>
    </footer>
  </article>
</template>

<style scoped>
.source-entry { position: relative; margin: 0 0 1.5rem; padding: 1rem; color: var(--text); cursor: default; }
.source-entry.selected { background: #f4f4f0; }
.entry-head { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; margin-bottom: 0.7rem; }
.entry-title { min-height: 2rem; border: 0; background: transparent; color: currentColor; padding: 0; font: 600 0.82rem/1.4 var(--font-ui); text-align: left; cursor: pointer; }
.entry-head time { flex: none; color: var(--faint); font-size: 0.68rem; }
.entry-text { margin: 0; color: var(--text); overflow-wrap: anywhere; white-space: pre-wrap; font: 1.04rem/1.9 var(--font-serif); }
.entry-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 0.8rem; margin-top: 0.8rem; color: var(--muted); font-size: 0.68rem; }
.entry-foot button { border: 0; border-bottom: 1px solid currentColor; background: transparent; color: inherit; padding: 0.15rem 0; cursor: pointer; }
.source--heaven { color: var(--heaven); border-block: 2px solid currentColor; }.source--heaven .entry-title { margin-inline: auto; }.source--heaven .entry-text { font-weight: 600; }
.source--fate { color: var(--fate); border: 1px dashed currentColor; }
.source--player { color: var(--player); border-left: 3px solid currentColor; background: #f5f8f7; }
.source--cultivator { color: var(--muted); border-top: 1px solid var(--line); }
.kind--combat { border: 2px solid var(--battle); }
.combat-label { display: block; margin: 0 0 0.55rem; color: var(--battle); font-size: 0.72rem; }
.compact { margin: 0; padding: 0.55rem 0.5rem; }
.compact .entry-head { display: block; margin: 0; }
.compact .entry-head time { display: block; margin-top: 0.25rem; }
.compact .entry-text, .compact .entry-foot, .compact .combat-label { display: none; }
@media (max-width: 620px) { .source-entry { padding: 0.85rem; } .entry-head { display: block; } .entry-head time { display: block; margin-top: 0.15rem; } }
</style>
