<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { ChronicleEntry, Cultivator } from '../types'

const props = defineProps<{
  entries: ChronicleEntry[]
  cultivators: Cultivator[]
  busy?: boolean | undefined
  paused?: boolean | undefined
  ended?: boolean | undefined
  error?: string | null | undefined
}>()
const emit = defineEmits<{ command: [text: string]; retry: [] }>()
const command = ref('')
const feed = ref<HTMLElement>()
const canSend = computed(() => command.value.trim().length > 0 && !props.busy && !props.paused && !props.ended)
const orderedEntries = computed(() => props.entries
  .filter((entry) => entry.kind !== 'rule')
  .toSorted((a, b) => a.day - b.day || a.sequence - b.sequence))

function sourceLabel(entry: ChronicleEntry): string {
  if (entry.source === 'heaven') return '天道'
  if (entry.source === 'fate') return '命运'
  if (entry.source === 'player') return '我'
  const names = entry.actorIds
    .map((id) => props.cultivators.find((person) => person.id === id)?.name)
    .filter((name): name is string => Boolean(name))
  return names.join('、') || '修士'
}

async function submit() {
  if (!canSend.value) return
  const text = command.value.trim()
  command.value = ''
  emit('command', text)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    submit()
  }
}

watch(() => props.entries.length, async () => {
  await nextTick()
  feed.value?.scrollTo({ top: feed.value.scrollHeight, behavior: 'smooth' })
})

</script>

<template>
  <section class="story-panel" aria-label="小说正文">
    <div ref="feed" class="story-feed">
      <template v-if="orderedEntries.length">
        <article v-for="entry in orderedEntries" :key="entry.id" class="story-entry" :class="[`source--${entry.source}`, `kind--${entry.kind}`]">
          <strong>{{ sourceLabel(entry) }}</strong>
          <p>{{ entry.text }}</p>
        </article>
      </template>
      <div v-if="busy" class="writing" aria-live="polite">
        ……
      </div>
    </div>
    <form class="command-box" @submit.prevent="submit">
      <div v-if="error || paused" class="inline-error" role="alert">
        <span>{{ error || '生成暂停' }}</span>
        <button type="button" :disabled="busy" @click="emit('retry')">{{ busy ? '重试中…' : '重试' }}</button>
      </div>
      <div class="command-input">
        <textarea v-model="command" rows="2" :disabled="busy || paused || ended" :placeholder="ended ? '此卷已终。' : '说什么，做什么，或者追问眼前之人……'" aria-label="输入玩家行动或对话" @keydown="onKeydown" />
        <button type="submit" :disabled="!canSend" aria-label="送出玩家行动">
          行动
        </button>
      </div>
    </form>
  </section>
</template>

<style scoped>
.story-panel { display: grid; width: 100%; height: 100%; min-width: 0; min-height: 0; grid-template-rows: 1fr auto; background: var(--surface); }
.story-feed { overflow-y: auto; scroll-behavior: smooth; padding: 2.5rem clamp(1rem, 5vw, 5rem) 3rem; }
.story-entry { max-width: 46rem; margin: 0 auto 1.75rem; padding: 0.2rem 0; }
.story-entry strong { display: block; margin-bottom: 0.35rem; color: var(--muted); font-size: 0.72rem; }
.story-entry p { margin: 0; overflow-wrap: anywhere; white-space: pre-wrap; font: 1.06rem/1.95 var(--font-serif); }
.story-entry.source--heaven { border-block: 1px solid var(--heaven); padding: 0.8rem 0; }.story-entry.source--heaven strong { color: var(--heaven); }
.story-entry.source--fate { border-left: 1px dashed var(--fate); padding-left: 1rem; }.story-entry.source--fate strong { color: var(--fate); }
.story-entry.source--player { border-left: 2px solid var(--player); padding-left: 1rem; }.story-entry.source--player strong { color: var(--player); }
.story-entry.kind--combat { border-left-color: var(--battle); }
.writing { max-width: 46rem; margin: 0 auto; color: var(--muted); font: 1.1rem var(--font-serif); }
.command-box { position: relative; z-index: 3; margin: 0 clamp(0.75rem, 2vw, 2rem) 1rem; border: 1px solid var(--line-strong); background: var(--surface); }
.inline-error { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 0.5rem; border-bottom: 1px solid var(--battle); background: #fff8f7; color: var(--battle); padding: 0.45rem 0.65rem; font-size: 0.72rem; }.inline-error button { min-height: 2rem; border: 0; background: transparent; color: inherit; cursor: pointer; }
.command-input { display: grid; grid-template-columns: 1fr auto; }
.command-input textarea { resize: none; border: 0; background: transparent; color: var(--text); padding: 0.8rem; font: 1rem/1.65 var(--font-serif); }
.command-input textarea::placeholder { color: var(--faint); }
.command-input button { width: 4.5rem; border: 0; border-left: 1px solid var(--line-strong); background: var(--text); color: #fff; font-size: 0.78rem; cursor: pointer; }
.command-input button:disabled { opacity: 0.35; cursor: not-allowed; }
@media (prefers-reduced-motion: reduce) { .story-feed { scroll-behavior: auto; } }
@media (max-width: 620px) { .story-feed { padding: 1.25rem 1rem 1.5rem; }.command-box { margin: 0 0.65rem 0.65rem; } }
</style>
