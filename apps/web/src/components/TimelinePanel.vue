<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ChronicleEntry, Cultivator } from '../types'
import SourceEntry from './SourceEntry.vue'

const props = defineProps<{
  entries: ChronicleEntry[]
  cultivators: Cultivator[]
  selectedId?: string | undefined
}>()
const emit = defineEmits<{ select: [id: string] }>()
const filter = ref<'all' | ChronicleEntry['source']>('all')
const filtered = computed(() => props.entries.filter((entry) => filter.value === 'all' || entry.source === filter.value))
</script>

<template>
  <section class="timeline-panel" aria-label="因果时间轴">
    <header class="panel-title">
      <h2>时间</h2>
    </header>
    <div class="source-filters" aria-label="筛选来源">
      <button v-for="item in ([['all','全部'], ['heaven','天道'], ['fate','命运'], ['player','我'], ['cultivator','修士']] as const)" :key="item[0]" type="button" :class="{ active: filter === item[0] }" :aria-pressed="filter === item[0]" @click="filter = item[0]">{{ item[1] }}</button>
    </div>
    <div v-if="filtered.length" class="timeline-list">
      <div v-for="entry in filtered" :key="entry.id" class="timeline-node" :class="`node--${entry.source}`">
        <button class="node-dot" type="button" :aria-label="`查看第 ${entry.day} 日事件`" @click="emit('select', entry.id)" />
        <SourceEntry :entry="entry" :cultivators="cultivators" :selected="selectedId === entry.id" compact @select="emit('select', $event)" />
      </div>
    </div>
    <div v-else class="panel-empty">命线尚未落墨。</div>
  </section>
</template>

<style scoped>
.timeline-panel { height: 100%; min-height: 0; padding: 1rem 0.75rem; overflow: hidden; background: var(--canvas); }
.panel-title { padding: 0 0.25rem 0.75rem; border-bottom: 1px solid var(--line); }
.panel-title h2 { margin: 0; font-size: 0.86rem; }
.source-filters { display: flex; flex-wrap: wrap; gap: 0.2rem; padding: 0.65rem 0; }
.source-filters button { min-height: 2rem; border: 0; background: transparent; color: var(--muted); padding: 0.25rem 0.4rem; font-size: 0.7rem; cursor: pointer; }
.source-filters button.active { color: var(--text); font-weight: 600; text-decoration: underline; text-underline-offset: 0.22rem; }
.timeline-list { height: calc(100% - 5.5rem); overflow-y: auto; padding: 0.25rem 0 2rem 1rem; }
.timeline-node { position: relative; padding: 0 0 0.75rem 0.75rem; border-left: 1px solid var(--line-strong); }
.node-dot { position: absolute; z-index: 2; left: -1.4rem; top: 0.35rem; width: 2.75rem; height: 2.75rem; border: 0; background: transparent; padding: 0; cursor: pointer; }
.node-dot::after { content: ''; display: block; width: 0.42rem; height: 0.42rem; margin: auto; border: 3px solid var(--canvas); border-radius: 50%; background: var(--muted); }
.node--heaven .node-dot::after { background: var(--heaven); }.node--fate .node-dot::after { background: var(--fate); }.node--player .node-dot::after { background: var(--player); }
.panel-empty { margin: 2.5rem 1rem; color: var(--faint); font-size: 0.78rem; text-align: center; }
</style>
