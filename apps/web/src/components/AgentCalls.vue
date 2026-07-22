<script setup lang="ts">
import { computed } from 'vue'
import type { Cultivator, RunningCall } from '../types'

const props = defineProps<{
  calls: Record<string, RunningCall>
  cultivators: Cultivator[]
  disconnected?: boolean | undefined
}>()
const running = computed(() => Object.values(props.calls).sort((a, b) => a.sequence - b.sequence))

function callName(call: RunningCall) {
  if (call.actorName) return call.actorName
  if (call.actorId) return props.cultivators.find((item) => item.id === call.actorId)?.name ?? call.actorId
  return call.source === 'heaven' ? '天道' : call.source === 'fate' ? '命运' : '无名神念'
}
</script>

<template>
  <div v-if="running.length || disconnected" class="calls-strip" :class="{ disconnected }" aria-live="polite">
    <div class="call-line" aria-hidden="true" />
    <span v-if="disconnected" class="stream-state">神念流已断，正在等待重连</span>
    <div v-for="(call, index) in running" :key="call.callId" class="mind" :style="{ '--index': index }">
      <span class="mind-orb" aria-hidden="true" />
      <span class="mind-name">{{ callName(call) }}</span>
      <span class="mind-state">{{ call.state === 'tool' ? `调用 · ${call.tool ?? '工具'}` : '推演中' }}</span>
    </div>
  </div>
</template>

<style scoped>
.calls-strip { position: relative; display: flex; min-height: 3.3rem; align-items: center; gap: 1.5rem; padding: 0.45rem 1rem; overflow-x: auto; border-block: 1px solid var(--line-faint); background: color-mix(in srgb, var(--jade) 3%, var(--night)); }
.call-line { position: absolute; left: 0; right: 0; top: 1.15rem; border-top: 1px dashed var(--jade-dim); }
.mind { position: relative; z-index: 1; display: grid; grid-template-columns: 1rem auto; grid-template-areas: 'orb name' 'orb state'; column-gap: 0.45rem; min-width: max-content; color: var(--jade-bright); animation: arrive 330ms ease-out both; animation-delay: calc(var(--index) * 80ms); }
.mind-orb { grid-area: orb; align-self: start; width: 0.8rem; height: 0.8rem; margin-top: 0.06rem; border: 1px solid var(--jade-bright); border-radius: 50%; background: var(--night); box-shadow: 0 0 9px var(--jade); animation: pulse 1.2s ease-in-out infinite; }
.mind-name { grid-area: name; font: 0.68rem var(--font-serif); letter-spacing: 0.08em; }
.mind-state { grid-area: state; color: var(--ink-faint); font: 0.57rem var(--font-ui); }
.stream-state { position: relative; z-index: 1; color: var(--cinnabar-bright); font: 0.65rem var(--font-ui); }
@keyframes arrive { from { opacity: 0; transform: translateX(-0.8rem); } }
@keyframes pulse { 50% { transform: scale(0.7); opacity: 0.55; } }
@media (prefers-reduced-motion: reduce) { .mind, .mind-orb { animation: none; } }
</style>
