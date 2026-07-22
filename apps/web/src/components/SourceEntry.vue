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
  heaven: { mark: '天道', title: '天道诏令' },
  fate: { mark: '命运', title: '命运谶语' },
  player: { mark: '我', title: '玩家原话' },
  cultivator: { mark: '修士', title: '修士行止' },
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
    @click="emit('select', entry.id)"
  >
    <span class="source-mark" aria-hidden="true">{{ sourceMeta[entry.source].mark }}</span>
    <header class="entry-head">
      <div>
        <span v-if="entry.source === 'fate'" class="hexagram" aria-hidden="true">☷ ☲</span>
        <strong>{{ heading }}</strong>
      </div>
      <time>{{ dateText }} · {{ entry.phase }}</time>
    </header>
    <div v-if="entry.kind === 'combat'" class="combat-ribbon">战局 · 已结算事实</div>
    <p class="entry-text">{{ entry.text }}</p>
    <footer v-if="entry.cost.sense || entry.cost.qi || entry.causeIds.length" class="entry-foot">
      <span v-if="entry.cost.sense">神识 −{{ entry.cost.sense }}</span>
      <span v-if="entry.cost.qi">灵力 −{{ entry.cost.qi }}</span>
      <button v-if="entry.causeIds.length" type="button" @click.stop="emit('select', entry.id)">
        追溯 {{ entry.causeIds.length }} 段因果
      </button>
    </footer>
  </article>
</template>

<style scoped>
.source-entry { position: relative; margin: 0 0 1.35rem; padding: 1.15rem 1.2rem 1.05rem 3.35rem; cursor: default; transition: background 150ms, border-color 150ms; }
.source-entry.selected { background: color-mix(in srgb, var(--gold) 5%, transparent); }
.source-mark { position: absolute; left: 0.75rem; top: 1rem; width: 1.5rem; color: currentColor; font: 0.82rem/1 var(--font-serif); text-align: center; writing-mode: vertical-rl; letter-spacing: 0.16em; }
.entry-head { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; margin-bottom: 0.75rem; }
.entry-head strong { font: 600 0.82rem/1.4 var(--font-serif); letter-spacing: 0.13em; }
.entry-head time { flex: none; color: var(--ink-faint); font: 0.62rem/1.2 var(--font-ui); letter-spacing: 0.05em; }
.hexagram { margin-right: 0.55rem; font-size: 0.76rem; }
.entry-text { margin: 0; color: var(--paper-ink); white-space: pre-wrap; font: 1rem/2 var(--font-serif); letter-spacing: 0.035em; }
.entry-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 0.8rem; margin-top: 0.85rem; color: currentColor; font: 0.65rem var(--font-ui); opacity: 0.75; }
.entry-foot button { border: 0; border-bottom: 1px solid currentColor; background: transparent; color: inherit; padding: 0.15rem 0; cursor: pointer; }
.source--heaven { color: var(--gold); border: 3px double var(--gold-dim); background: color-mix(in srgb, var(--gold) 4%, transparent); }
.source--heaven .entry-text { font-weight: 600; letter-spacing: 0.09em; }
.source--fate { color: var(--fate-bright); border: 1px dashed var(--fate); background: color-mix(in srgb, var(--fate) 7%, transparent); }
.source--fate::after { content: ''; position: absolute; inset: 5px; pointer-events: none; border: 1px dashed color-mix(in srgb, var(--fate) 35%, transparent); }
.source--player { color: var(--jade-bright); border: 1px solid var(--jade); border-left: 4px solid var(--jade-bright); background: color-mix(in srgb, var(--jade) 7%, transparent); }
.source--player .entry-text { font-size: 1.04rem; }
.source--cultivator { color: var(--ink-soft); border: 1px solid var(--line); border-left: 2px solid var(--ink-soft); }
.kind--combat { border-color: var(--cinnabar); box-shadow: inset 3px 0 var(--cinnabar), inset -2px -2px color-mix(in srgb, var(--cinnabar) 45%, transparent); }
.kind--combat::before { content: ''; position: absolute; right: -1px; top: 40%; width: 16px; border-top: 5px solid var(--night); transform: rotate(-35deg); }
.combat-ribbon { display: inline-block; margin: 0 0 0.65rem; border: 1px solid var(--cinnabar); background: color-mix(in srgb, var(--cinnabar) 13%, transparent); color: var(--cinnabar-bright); padding: 0.23rem 0.55rem; font: 0.66rem var(--font-ui); letter-spacing: 0.14em; }
.compact { margin: 0; padding: 0.8rem 0.8rem 0.8rem 2.5rem; }
.compact .entry-head { display: block; margin: 0; }
.compact .entry-head time { display: block; margin-top: 0.25rem; }
.compact .entry-text, .compact .entry-foot, .compact .combat-ribbon { display: none; }
.compact .source-mark { left: 0.55rem; top: 0.7rem; }
@media (max-width: 620px) { .source-entry { padding-right: 0.9rem; padding-left: 2.8rem; } .entry-head { display: block; } .entry-head time { display: block; margin-top: 0.3rem; } }
</style>
