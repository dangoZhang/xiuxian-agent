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
    <header class="chapter-head">
      <div class="chapter-rule" />
      <div>
        <span>太虚一梦 · 活卷</span>
        <small>所有文字均由本局模型与已结算事实生成</small>
      </div>
      <div class="chapter-rule" />
    </header>
    <div ref="feed" class="story-feed">
      <template v-if="entries.length">
        <div v-for="entry in entries" :key="entry.id" :data-entry-id="entry.id">
          <SourceEntry :entry="entry" :cultivators="cultivators" :selected="entry.id === selectedId" @select="emit('select', $event)" />
        </div>
      </template>
      <div v-else class="story-empty">
        <span class="empty-mark">卷</span>
        <p>天机未落，静候第一笔。</p>
      </div>
      <div v-if="busy" class="writing" aria-live="polite">
        <span /><span /><span />
        <p>因果正在结算，众修神念交锋……</p>
      </div>
    </div>
    <form class="command-box" @submit.prevent="submit">
      <div class="command-label">
        <span>以我之念</span>
        <small>{{ ended ? '此卷已终，可导出存档' : paused ? '时间轴已暂停，请先重试' : 'ENTER 送出 · SHIFT + ENTER 换行' }}</small>
      </div>
      <div class="command-input">
        <textarea v-model="command" rows="2" :disabled="busy || paused || ended" :placeholder="ended ? '此卷已终。' : '说什么，做什么，或者追问眼前之人……'" aria-label="输入玩家行动或对话" @keydown="onKeydown" />
        <button type="submit" :disabled="!canSend" aria-label="送出玩家行动">
          <span>落子</span><span aria-hidden="true">↗</span>
        </button>
      </div>
    </form>
  </section>
</template>

<style scoped>
.story-panel { display: grid; min-width: 0; min-height: 0; grid-template-rows: auto 1fr auto; background: radial-gradient(circle at 50% 10%, color-mix(in srgb, var(--paper) 4%, transparent), transparent 38%), var(--night); }
.chapter-head { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 1rem; padding: 0.8rem 1.5rem; text-align: center; }
.chapter-head span { display: block; color: var(--paper); font: 0.78rem var(--font-serif); letter-spacing: 0.18em; }
.chapter-head small { color: var(--ink-faint); font: 0.54rem var(--font-ui); }
.chapter-rule { border-top: 3px double var(--gold-dim); }
.story-feed { overflow-y: auto; scroll-behavior: smooth; padding: 1.5rem clamp(1rem, 4vw, 4.2rem) 3rem; }
.story-feed > div { max-width: 49rem; margin-inline: auto; }
.story-empty { display: grid; min-height: 50vh; place-content: center; color: var(--ink-faint); text-align: center; }
.empty-mark { display: grid; width: 4rem; height: 4rem; place-items: center; margin: auto; border: 1px solid var(--line); font: 1.6rem var(--font-serif); transform: rotate(-3deg); }
.story-empty p { font: 0.82rem var(--font-serif); letter-spacing: 0.15em; }
.writing { display: flex; align-items: center; gap: 0.35rem; color: var(--gold); }
.writing span { width: 0.35rem; height: 0.35rem; border-radius: 50%; background: currentColor; animation: ink 1s ease-in-out infinite; }
.writing span:nth-child(2) { animation-delay: 120ms; }.writing span:nth-child(3) { animation-delay: 240ms; }
.writing p { margin-left: 0.5rem; color: var(--ink-faint); font: 0.7rem var(--font-ui); }
.command-box { position: relative; z-index: 3; margin: 0 clamp(0.75rem, 2vw, 2rem) 1rem; border: 1px solid var(--jade-dim); background: var(--night-2); box-shadow: 0 -12px 30px color-mix(in srgb, var(--night) 70%, transparent); }
.command-label { display: flex; align-items: baseline; justify-content: space-between; padding: 0.55rem 0.8rem 0.25rem; color: var(--jade-bright); }
.command-label span { font: 0.72rem var(--font-serif); letter-spacing: 0.13em; }
.command-label small { color: var(--ink-faint); font: 0.52rem var(--font-ui); }
.command-input { display: grid; grid-template-columns: 1fr auto; }
.command-input textarea { resize: none; border: 0; outline: 0; background: transparent; color: var(--paper); padding: 0.45rem 0.8rem 0.75rem; font: 0.94rem/1.6 var(--font-serif); }
.command-input textarea::placeholder { color: var(--ink-faint); }
.command-input button { display: flex; width: 4.2rem; flex-direction: column; align-items: center; justify-content: center; gap: 0.15rem; border: 0; border-left: 1px solid var(--jade-dim); background: color-mix(in srgb, var(--jade) 13%, transparent); color: var(--jade-bright); font: 0.68rem var(--font-serif); cursor: pointer; }
.command-input button:disabled { opacity: 0.35; cursor: not-allowed; }
@keyframes ink { 50% { opacity: 0.2; transform: translateY(-3px); } }
@media (prefers-reduced-motion: reduce) { .writing span { animation: none; } .story-feed { scroll-behavior: auto; } }
@media (max-width: 620px) { .chapter-head { padding: 0.6rem 0.8rem; }.chapter-head small { display: none; }.story-feed { padding: 1rem 0.75rem 7.5rem; }.command-box { position: fixed; inset: auto 0.55rem 3.9rem; margin: 0; }.command-label small { display: none; } }
</style>
