<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useGameStore } from '../stores/game'
import AgentCalls from './AgentCalls.vue'
import TimelinePanel from './TimelinePanel.vue'
import StoryPanel from './StoryPanel.vue'
import StatusPanel from './StatusPanel.vue'

const store = useGameStore()
const { game, activeCalls, busy, error, streamDisconnected } = storeToRefs(store)
const view = ref<'story' | 'timeline' | 'status'>('story')
const selectedId = ref<string>()
const fileInput = ref<HTMLInputElement>()

const dateText = computed(() => {
  const dayValue = Math.max(1, game.value?.day ?? 1)
  const year = Math.floor((dayValue - 1) / 360) + 1
  const dayOfYear = (dayValue - 1) % 360
  return `道历 ${year} 年 · ${Math.floor(dayOfYear / 30) + 1} 月 ${dayOfYear % 30 + 1} 日`
})

function selectEntry(id: string) {
  selectedId.value = id
  if (window.matchMedia('(max-width: 960px)').matches) view.value = 'story'
}

function chooseSave() { fileInput.value?.click() }
async function importSave(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) await store.importSave(file)
  input.value = ''
}
</script>

<template>
  <div v-if="game" class="game-desk">
    <header class="game-bar">
      <strong class="brand">修仙agent</strong>
      <div class="world-time">{{ dateText }}</div>
      <div class="bar-actions">
        <span v-if="game.ending" class="ending">{{ game.ending }}</span>
        <button type="button" @click="chooseSave">导入</button>
        <button type="button" @click="store.exportSave">导出</button>
        <input ref="fileInput" class="sr-only" type="file" accept="application/json,.json" @change="importSave" />
      </div>
    </header>

    <AgentCalls :calls="activeCalls" :cultivators="game.cultivators" :disconnected="streamDisconnected" />

    <div v-if="error || game.paused" class="pause-banner" role="alert">
      <div><strong>时间暂停</strong><p>{{ error || game.pauseReason || '本轮模型调用未完成。' }}</p></div>
      <button type="button" :disabled="busy" @click="store.retry">{{ busy ? '重试中…' : '整轮重试' }}</button>
      <button type="button" class="dismiss" aria-label="关闭错误提示" @click="store.clearError">×</button>
    </div>

    <main class="desk-grid">
      <div class="desk-pane pane--timeline" :class="{ 'mobile-active': view === 'timeline' }">
        <TimelinePanel :entries="game.entries" :cultivators="game.cultivators" :selected-id="selectedId" @select="selectEntry" />
      </div>
      <div class="desk-pane pane--story" :class="{ 'mobile-active': view === 'story' }">
        <StoryPanel :entries="game.entries" :cultivators="game.cultivators" :selected-id="selectedId" :busy="busy" :paused="game.paused" :ended="Boolean(game.ending)" @select="selectedId = $event" @command="store.sendCommand" />
      </div>
      <div class="desk-pane pane--status" :class="{ 'mobile-active': view === 'status' }">
        <StatusPanel :cultivators="game.cultivators" :protagonist-id="game.protagonistId" :calls="activeCalls" />
      </div>
    </main>

    <nav class="mobile-nav" aria-label="切换游戏视图">
      <button type="button" :class="{ active: view === 'story' }" :aria-pressed="view === 'story'" @click="view = 'story'"><span>文</span>正文</button>
      <button type="button" :class="{ active: view === 'timeline' }" :aria-pressed="view === 'timeline'" @click="view = 'timeline'"><span>线</span>时间轴</button>
      <button type="button" :class="{ active: view === 'status' }" :aria-pressed="view === 'status'" @click="view = 'status'"><span>人</span>角色</button>
    </nav>
  </div>
</template>

<style scoped>
.game-desk { display: flex; height: 100dvh; min-width: 0; flex-direction: column; overflow: hidden; background: var(--canvas); }
.game-bar { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; min-height: 3.5rem; padding: 0.5rem 1rem; border-bottom: 1px solid var(--line); background: var(--surface); }
.brand { font: 600 1rem var(--font-serif); }.world-time { color: var(--muted); font-size: 0.76rem; text-align: center; }
.bar-actions { display: flex; align-items: center; justify-content: flex-end; gap: 0.35rem; }.bar-actions button { min-height: 2.4rem; border: 0; background: transparent; color: var(--muted); padding: 0.4rem 0.55rem; font-size: 0.75rem; cursor: pointer; }.bar-actions button:hover { color: var(--text); }.ending { color: var(--heaven); font: 600 0.76rem var(--font-serif); }
.pause-banner { display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 0.8rem; border-bottom: 1px solid var(--battle); background: #fff8f7; padding: 0.55rem 1rem; }.pause-banner strong { display: block; color: var(--battle); font-size: 0.76rem; }.pause-banner p { margin: 0.1rem 0 0; color: var(--muted); font-size: 0.72rem; }.pause-banner button { min-height: 2.4rem; border: 1px solid var(--battle); background: transparent; color: var(--battle); padding: 0.4rem 0.7rem; font-size: 0.72rem; cursor: pointer; }.pause-banner .dismiss { border: 0; font-size: 1rem; }
.desk-grid { display: grid; width: 100%; max-width: 96rem; min-height: 0; flex: 1; grid-template-columns: minmax(13rem, 16rem) minmax(28rem, 1fr) minmax(14rem, 17rem); margin: 0 auto; border-inline: 1px solid var(--line); background: var(--surface); }.desk-pane { min-width: 0; min-height: 0; border-right: 1px solid var(--line); }.desk-pane:last-child { border-right: 0; }
.mobile-nav { display: none; }
@media (max-width: 960px) {
  .game-bar { grid-template-columns: 1fr auto 1fr; }
  .desk-grid { display: block; }.desk-pane { display: none; height: 100%; border: 0; }.desk-pane.mobile-active { display: block; }
  .mobile-nav { position: relative; z-index: 8; display: grid; min-height: 3.5rem; grid-template-columns: repeat(3, 1fr); border-top: 1px solid var(--line); background: var(--surface); padding-bottom: env(safe-area-inset-bottom); }.mobile-nav button { display: flex; min-height: 3.5rem; align-items: center; justify-content: center; gap: 0.4rem; border: 0; border-top: 2px solid transparent; border-right: 1px solid var(--line); background: transparent; color: var(--muted); font-size: 0.75rem; }.mobile-nav span { font-family: var(--font-serif); }.mobile-nav button.active { border-top-color: var(--text); color: var(--text); }
  .pause-banner { grid-template-columns: minmax(0, 1fr) auto; }.pause-banner .dismiss { display: none; }.pause-banner p { max-width: 48vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
}
@media (max-width: 560px) { .game-bar { grid-template-columns: 1fr auto; padding-inline: 0.7rem; }.world-time { display: none; }.bar-actions button { padding-inline: 0.4rem; }.ending { display: none; }.pause-banner { padding-inline: 0.7rem; } }
</style>
