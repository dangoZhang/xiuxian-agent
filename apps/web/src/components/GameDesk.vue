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
  if (window.matchMedia('(max-width: 800px)').matches) view.value = 'story'
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
      <div class="brand"><span class="brand-seal">修</span><div><strong>修仙agent</strong><small>LIVE CULTIVATION CHRONICLE</small></div></div>
      <div class="world-time"><span>{{ dateText }}</span><small>REV. {{ game.revision }}</small></div>
      <div class="bar-actions">
        <span v-if="game.ending" class="ending">{{ game.ending }}</span>
        <button type="button" @click="chooseSave">导入</button>
        <button type="button" @click="store.exportSave">导出</button>
        <input ref="fileInput" class="sr-only" type="file" accept="application/json,.json" @change="importSave" />
      </div>
    </header>

    <AgentCalls :calls="activeCalls" :cultivators="game.cultivators" :disconnected="streamDisconnected" />

    <div v-if="error || game.paused" class="pause-banner" role="alert">
      <span class="pause-seal">止</span>
      <div><strong>时间轴停在原 revision</strong><p>{{ error || game.pauseReason || '本轮模型调用未完成。' }}</p></div>
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
      <button type="button" :class="{ active: view === 'story' }" @click="view = 'story'"><span>文</span>正文</button>
      <button type="button" :class="{ active: view === 'timeline' }" @click="view = 'timeline'"><span>线</span>时间轴</button>
      <button type="button" :class="{ active: view === 'status' }" @click="view = 'status'"><span>人</span>角色</button>
    </nav>
  </div>
</template>

<style scoped>
.game-desk { display: grid; height: 100dvh; min-width: 0; grid-template-rows: auto auto auto minmax(0, 1fr); overflow: hidden; background: var(--night); }
.game-bar { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; min-height: 3.65rem; padding: 0.55rem 1rem; border-bottom: 1px solid var(--line); background: var(--night-2); }.brand { display: flex; align-items: center; gap: 0.65rem; }.brand-seal { display: grid; width: 2rem; height: 2rem; place-items: center; border: 1px solid var(--cinnabar); color: var(--cinnabar-bright); font: 0.9rem var(--font-serif); transform: rotate(-3deg); }.brand strong { display: block; color: var(--paper); font: 0.85rem var(--font-serif); letter-spacing: 0.12em; }.brand small { display: block; color: var(--gold); font: 0.5rem var(--font-ui); letter-spacing: 0.12em; }.world-time { text-align: center; }.world-time span { display: block; color: var(--paper); font: 0.76rem var(--font-serif); letter-spacing: 0.12em; }.world-time small { color: var(--ink-faint); font: 0.52rem var(--font-ui); }.bar-actions { display: flex; align-items: center; justify-content: flex-end; gap: 0.4rem; }.bar-actions button { border: 1px solid var(--line); background: transparent; color: var(--ink-muted); padding: 0.4rem 0.65rem; font: 0.62rem var(--font-ui); cursor: pointer; }.ending { color: var(--gold); font: 0.68rem var(--font-serif); }
.pause-banner { position: relative; display: grid; grid-template-columns: auto 1fr auto auto; align-items: center; gap: 0.8rem; border-bottom: 1px solid var(--cinnabar); background: color-mix(in srgb, var(--cinnabar) 9%, var(--night)); padding: 0.55rem 1rem; }.pause-seal { display: grid; width: 1.7rem; height: 1.7rem; place-items: center; border: 1px solid var(--cinnabar); color: var(--cinnabar-bright); font: 0.72rem var(--font-serif); }.pause-banner strong { display: block; color: var(--cinnabar-bright); font: 0.7rem var(--font-serif); }.pause-banner p { margin: 0.1rem 0 0; color: var(--ink-muted); font: 0.62rem var(--font-ui); }.pause-banner button { border: 1px solid var(--cinnabar); background: transparent; color: var(--cinnabar-bright); padding: 0.4rem 0.7rem; font: 0.62rem var(--font-ui); cursor: pointer; }.pause-banner .dismiss { border: 0; font-size: 1rem; }
.desk-grid { display: grid; min-height: 0; grid-template-columns: minmax(15rem, 22vw) minmax(30rem, 1fr) minmax(16rem, 23vw); }.desk-pane { min-width: 0; min-height: 0; border-right: 1px solid var(--line); }.desk-pane:last-child { border-right: 0; }
.mobile-nav { display: none; }
@media (max-width: 1000px) { .desk-grid { grid-template-columns: 16rem minmax(26rem, 1fr) 16rem; } }
@media (max-width: 800px) {
  .game-desk { grid-template-rows: auto auto auto minmax(0, 1fr) auto; }
  .game-bar { grid-template-columns: 1fr auto; }.world-time { display: none; }.brand small { display: none; }
  .desk-grid { display: block; }.desk-pane { display: none; height: 100%; border: 0; }.desk-pane.mobile-active { display: block; }
  .mobile-nav { position: relative; z-index: 8; display: grid; height: 3.45rem; grid-template-columns: repeat(3, 1fr); border-top: 1px solid var(--line); background: var(--night-2); }.mobile-nav button { display: flex; align-items: center; justify-content: center; gap: 0.45rem; border: 0; border-right: 1px solid var(--line-faint); background: transparent; color: var(--ink-faint); font: 0.65rem var(--font-ui); }.mobile-nav span { font: 0.82rem var(--font-serif); }.mobile-nav button.active { color: var(--jade-bright); box-shadow: inset 0 2px var(--jade); }
  .pause-banner { grid-template-columns: auto 1fr auto; }.pause-banner .dismiss { display: none; }.pause-banner p { max-width: 48vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
}
@media (max-width: 430px) { .game-bar { padding-inline: 0.65rem; }.bar-actions button { padding-inline: 0.45rem; }.ending { display: none; }.pause-banner { padding-inline: 0.65rem; }.pause-seal { display: none; } }
</style>
