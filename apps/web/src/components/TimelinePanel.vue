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
const zoom = ref(1)
const filter = ref<'all' | ChronicleEntry['source']>('all')
const filtered = computed(() => props.entries.filter((entry) => filter.value === 'all' || entry.source === filter.value))
</script>

<template>
  <section class="timeline-panel" aria-label="因果时间轴">
    <header class="panel-title">
      <div><span>因果命线</span><small>CHRONICLE</small></div>
      <div class="zoom-controls" aria-label="缩放时间轴">
        <button type="button" aria-label="缩小" :disabled="zoom <= 0.78" @click="zoom = Math.max(0.75, zoom - 0.15)">−</button>
        <button type="button" aria-label="重置缩放" @click="zoom = 1">{{ Math.round(zoom * 100) }}%</button>
        <button type="button" aria-label="放大" :disabled="zoom >= 1.35" @click="zoom = Math.min(1.4, zoom + 0.15)">＋</button>
      </div>
    </header>
    <div class="source-filters" aria-label="筛选来源">
      <button v-for="item in ([['all','全部'], ['heaven','天'], ['fate','命'], ['player','我'], ['cultivator','修']] as const)" :key="item[0]" type="button" :class="{ active: filter === item[0] }" @click="filter = item[0]">{{ item[1] }}</button>
    </div>
    <div v-if="filtered.length" class="timeline-list" :style="{ '--zoom': zoom }">
      <div v-for="entry in filtered" :key="entry.id" class="timeline-node" :class="`node--${entry.source}`">
        <button class="node-dot" type="button" :aria-label="`查看第 ${entry.day} 日事件`" @click="emit('select', entry.id)" />
        <SourceEntry :entry="entry" :cultivators="cultivators" :selected="selectedId === entry.id" compact @select="emit('select', $event)" />
      </div>
    </div>
    <div v-else class="panel-empty">命线尚未落墨。</div>
  </section>
</template>

<style scoped>
.timeline-panel { height: 100%; min-height: 0; padding: 1.1rem 0.9rem 1.5rem 1rem; overflow: hidden; background: linear-gradient(90deg, color-mix(in srgb, var(--gold) 3%, transparent), transparent 30%); }
.panel-title { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0 0.35rem 0.8rem; border-bottom: 1px solid var(--line-faint); }
.panel-title span { display: block; color: var(--paper); font: 0.92rem var(--font-serif); letter-spacing: 0.14em; }
.panel-title small { color: var(--gold); font: 0.57rem var(--font-ui); letter-spacing: 0.18em; }
.zoom-controls { display: flex; border: 1px solid var(--line-faint); }
.zoom-controls button { min-width: 1.85rem; border: 0; border-right: 1px solid var(--line-faint); background: transparent; color: var(--ink-muted); padding: 0.3rem; font: 0.58rem var(--font-ui); cursor: pointer; }
.zoom-controls button:last-child { border: 0; }
.source-filters { display: flex; gap: 0.3rem; padding: 0.7rem 0.25rem; }
.source-filters button { flex: 1; border: 1px solid transparent; background: transparent; color: var(--ink-faint); padding: 0.35rem 0.2rem; font: 0.64rem var(--font-serif); cursor: pointer; }
.source-filters button.active { border-color: var(--line); color: var(--paper); }
.timeline-list { height: calc(100% - 6rem); overflow-y: auto; padding: 0.3rem 0.3rem 2rem 1.25rem; font-size: calc(1rem * var(--zoom)); transform-origin: top left; }
.timeline-node { position: relative; padding: 0 0 0.9rem 1rem; border-left: 1px solid var(--line); }
.node-dot { position: absolute; z-index: 2; left: -0.34rem; top: 1rem; width: 0.62rem; height: 0.62rem; border: 2px solid var(--night); border-radius: 50%; background: var(--ink-soft); padding: 0; cursor: pointer; box-shadow: 0 0 0 1px var(--ink-soft); }
.node--heaven .node-dot { background: var(--gold); box-shadow: 0 0 0 1px var(--gold); }
.node--fate .node-dot { background: var(--fate-bright); box-shadow: 0 0 0 1px var(--fate); }
.node--player .node-dot { background: var(--jade-bright); box-shadow: 0 0 0 1px var(--jade); }
.panel-empty { margin: 2.5rem 1rem; color: var(--ink-faint); font: 0.85rem var(--font-serif); text-align: center; }
</style>
