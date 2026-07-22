<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { ChronicleEntry, Cultivator } from '../types'
import SourceEntry from './SourceEntry.vue'

const props = defineProps<{
  entries: ChronicleEntry[]
  cultivators: Cultivator[]
  selectedId?: string | undefined
  busy?: boolean | undefined
  paused?: boolean | undefined
  ended?: boolean | undefined
}>()
const emit = defineEmits<{ select: [id: string]; command: [text: string] }>()
const command = ref('')
const feed = ref<HTMLElement>()
const canSend = computed(() => command.value.trim().length > 0 && !props.busy && !props.paused && !props.ended)

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

watch(() => props.selectedId, async (id) => {
  if (!id) return
  await nextTick()
  feed.value?.querySelector(`[data-entry-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
})
</script>

<template>
  <section class="story-panel" aria-label="小说正文">
    <div ref="feed" class="story-feed">
      <template v-if="entries.length">
        <div v-for="entry in entries" :key="entry.id" :data-entry-id="entry.id">
          <SourceEntry :entry="entry" :cultivators="cultivators" :selected="entry.id === selectedId" @select="emit('select', $event)" />
        </div>
      </template>
      <div v-else class="story-empty">
        <p>故事尚未开始。</p>
      </div>
      <div v-if="busy" class="writing" aria-live="polite">
        正在结算因果与修士行动…
      </div>
    </div>
    <form class="command-box" @submit.prevent="submit">
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
.story-panel { display: grid; min-width: 0; min-height: 0; grid-template-rows: 1fr auto; background: var(--surface); }
.story-feed { overflow-y: auto; scroll-behavior: smooth; padding: 2rem clamp(1rem, 4vw, 4rem) 3rem; }
.story-feed > div { max-width: 48rem; margin-inline: auto; }
.story-empty { display: grid; min-height: 50vh; place-content: center; color: var(--faint); text-align: center; }
.story-empty p { font-size: 0.82rem; }
.writing { max-width: 48rem; margin: 0 auto; color: var(--muted); font-size: 0.76rem; }
.command-box { position: relative; z-index: 3; margin: 0 clamp(0.75rem, 2vw, 2rem) 1rem; border: 1px solid var(--line-strong); background: var(--surface); }
.command-input { display: grid; grid-template-columns: 1fr auto; }
.command-input textarea { resize: none; border: 0; background: transparent; color: var(--text); padding: 0.8rem; font: 1rem/1.65 var(--font-serif); }
.command-input textarea::placeholder { color: var(--faint); }
.command-input button { width: 4.5rem; border: 0; border-left: 1px solid var(--line-strong); background: var(--text); color: #fff; font-size: 0.78rem; cursor: pointer; }
.command-input button:disabled { opacity: 0.35; cursor: not-allowed; }
@media (prefers-reduced-motion: reduce) { .story-feed { scroll-behavior: auto; } }
@media (max-width: 620px) { .story-feed { padding: 1rem 0.75rem 1.5rem; }.command-box { margin: 0 0.65rem 0.65rem; } }
</style>
