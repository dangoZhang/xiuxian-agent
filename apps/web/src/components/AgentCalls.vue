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
    <strong>神识并行 {{ running.length }}</strong>
    <span v-if="disconnected" class="stream-state">连接中断，等待重连</span>
    <span v-for="call in running" :key="call.callId" class="mind">
      {{ callName(call) }}：{{ call.state === 'tool' ? `调用 ${call.tool ?? '工具'}` : '推演中' }}
    </span>
  </div>
</template>

<style scoped>
.calls-strip { display: flex; min-height: 2.5rem; align-items: center; gap: 1rem; padding: 0.4rem 1rem; overflow-x: auto; border-bottom: 1px solid var(--line); background: var(--canvas); color: var(--muted); font-size: 0.72rem; white-space: nowrap; }
.calls-strip strong { color: var(--text); font-size: inherit; }.mind { border-left: 1px solid var(--line-strong); padding-left: 1rem; }.stream-state { color: var(--battle); }
</style>
